import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { questions, lireStructure, colonnesSource, copierTable, compter, migrer } from './assistant.mjs'

const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const queryKey = query => digest(query.trim().replace(/\r\n/g, '\n'))

export class ArchiveSource {
  constructor(folder) {
    this.folder = folder
    this.manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'))
    if (this.manifest.format !== 'ocr-offline-1') throw new Error('Format ZIP incompatible')
    for (const [name, hash] of Object.entries(this.manifest.files)) {
      if (!/^[a-f0-9]{64}\.(json|bin)$/.test(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Manifest invalide')
      if (digest(fs.readFileSync(path.join(folder, name))) !== hash) throw new Error(`Archive incomplete ou endommagee : ${name}`)
    }
  }
  read(name) {
    if (!Object.hasOwn(this.manifest.files, name)) throw new Error(`Element absent du ZIP : ${name}`)
    return fs.readFileSync(path.join(this.folder, name))
  }
  async sql(query) { return JSON.parse(this.read(queryKey(query) + '.json')) }
  async telecharger(bucket, name) { return this.read(digest(JSON.stringify([bucket, name])) + '.bin') }
}

export async function exporter(folder, remote = null) {
  fs.mkdirSync(folder, { recursive: true })
  if (fs.readdirSync(folder).length) throw new Error('Le dossier export doit etre vide')
  if (!remote) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    try { remote = await questions(rl) } finally { rl.close() }
  }
  const manifest = { format: 'ocr-offline-1', created: new Date().toISOString(), files: {}, counts: {} }
  const save = (name, value) => {
    fs.writeFileSync(path.join(folder, name), value)
    manifest.files[name] = digest(value)
  }
  const src = { sql: async query => {
    const rows = await remote.sql(query)
    save(queryKey(query) + '.json', JSON.stringify(rows))
    return rows
  } }
  console.log('Export en cours. Ne modifiez pas les donnees du serveur pendant la copie.')
  const structure = await lireStructure(src)
  const unsupported = await remote.sql("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('p','f')")
  if (unsupported.length) throw new Error('Tables partitionnees ou etrangeres non prises en charge : ' + unsupported.map(t => t.relname).join(', '))
  if (structure.autresSchemas.length) throw new Error('Schemas supplementaires non pris en charge : ' + structure.autresSchemas.join(', '))
  await compter(src, 'auth.users')
  const objects = await src.sql('select * from storage.objects order by bucket_id, name')
  for (const t of structure.tables) await compter(src, t.q)
  const tables = ['auth.users', 'auth.identities', 'storage.buckets', ...structure.tables.map(t => t.q)]
  for (const table of tables) {
    const columns = await colonnesSource(src, table)
    const before = await compter(remote, table)
    // Reuse precisely the migration's paginated reads, without writing to a database.
    const sink = { query: async () => ({ rows: columns.map(nom => ({ nom })) }) }
    const copied = await copierTable(src, sink, table, columns)
    const after = await compter(remote, table)
    if (before !== copied || after !== copied) throw new Error(`La table ${table} a change pendant l'export. Relancez hors utilisation.`)
    manifest.counts[table] = copied
  }
  for (const [i, object] of objects.entries()) {
    save(digest(JSON.stringify([object.bucket_id, object.name])) + '.bin', await remote.telecharger(object.bucket_id, object.name))
    console.log(`Fichiers : ${i + 1}/${objects.length}`)
  }
  const current = await remote.sql('select * from storage.objects order by bucket_id, name')
  if (JSON.stringify(current) !== JSON.stringify(objects)) throw new Error('Le stockage a change pendant la copie. Relancez hors utilisation.')
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2))
  new ArchiveSource(folder)
  console.log('Export verifie : comptes, schema public, donnees et fichiers Storage.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, folder] = process.argv.slice(2)
    if (!folder) throw new Error('Dossier archive requis')
    if (action === 'export') await exporter(folder)
    else if (action === 'verify') { new ArchiveSource(folder); console.log('Archive verifiee') }
    else if (action === 'import') await migrer(new ArchiveSource(folder))
    else throw new Error('Action attendue : export, verify ou import')
  } catch (e) { console.error(e.message); process.exit(1) }
}
