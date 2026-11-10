import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { questions, lireStructure, colonnesSource, copierTable, compter, migrer, suivi, demarrerSuivi, arreterSuivi } from './assistant.mjs'

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

// Export reprenable : chaque réponse du serveur est écrite dans le dossier dès qu'elle est reçue.
// Si l'export est interrompu, la relance relit ces réponses sur le disque et ne redemande
// au serveur que ce qui manque. Le serveur reste en lecture seule.
export async function exporter(folder, remote = null) {
  fs.mkdirSync(folder, { recursive: true })
  if (fs.existsSync(path.join(folder, 'manifest.json'))) throw new Error('Cet export est déjà terminé dans ce dossier')
  if (!remote) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    try { remote = await questions(rl) } finally { rl.close() }
  }

  // Le dossier partiel ne sert que pour le serveur qui l'a créé.
  const identite = remote.url || 'source-de-test'
  const marque = path.join(folder, 'reprise.json')
  let precedent = null
  try { precedent = JSON.parse(fs.readFileSync(marque, 'utf8')) } catch {}
  if (precedent && precedent.source !== identite) {
    console.log('Ce dossier contient un export partiel d\'un autre serveur : on repart de zéro.')
    for (const nom of fs.readdirSync(folder)) fs.rmSync(path.join(folder, nom), { recursive: true, force: true })
  }
  fs.writeFileSync(marque, JSON.stringify({ source: identite }))
  const dejaRecus = fs.readdirSync(folder).filter(nom => /\.(json|bin)$/.test(nom) && nom !== 'reprise.json').length
  if (dejaRecus) console.log(`Reprise : ${dejaRecus} élément(s) déjà reçu(s) lors d'un essai précédent, ils ne sont pas redemandés au serveur.`)

  const manifest = { format: 'ocr-offline-1', created: new Date().toISOString(), files: {}, counts: {} }
  // Écriture atomique : un fichier présent sous son nom définitif est forcément complet.
  const ecrire = (nom, valeur) => {
    const chemin = path.join(folder, nom)
    fs.writeFileSync(`${chemin}.tmp`, valeur)
    fs.renameSync(`${chemin}.tmp`, chemin)
  }
  const relire = nom => {
    const chemin = path.join(folder, nom)
    return fs.existsSync(chemin) ? fs.readFileSync(chemin) : null
  }
  const save = (name, value) => {
    ecrire(name, value)
    manifest.files[name] = digest(value)
  }
  const src = { sql: async query => {
    const nom = queryKey(query) + '.json'
    const existant = relire(nom)
    if (existant) {
      try {
        const rows = JSON.parse(existant)
        manifest.files[nom] = digest(existant)
        return rows
      } catch { /* fichier illisible (coupure pendant l'écriture) : on le redemande */ }
    }
    const rows = await remote.sql(query)
    save(nom, JSON.stringify(rows))
    return rows
  } }
  console.log('Export en cours. Ne modifiez pas les donnees du serveur pendant la copie.')
  demarrerSuivi()
  suivi.etape = 'Lecture de la structure'
  const structure = await lireStructure(src)
  const unsupported = await remote.sql("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('p','f')")
  if (unsupported.length) throw new Error('Tables partitionnees ou etrangeres non prises en charge : ' + unsupported.map(t => t.relname).join(', '))
  if (structure.autresSchemas.length) throw new Error('Schemas supplementaires non pris en charge : ' + structure.autresSchemas.join(', '))
  await compter(src, 'auth.users')
  const objects = await src.sql('select * from storage.objects order by bucket_id, name')
  suivi.etape = 'Comptage des lignes'
  // Total de lignes à copier, affiché pendant l'export (les comptages sont aussi gardés pour la reprise).
  suivi.lignesTotales = 0
  for (const table of ['auth.users', 'auth.identities', 'storage.buckets', ...structure.tables.map(t => t.q)]) {
    suivi.lignesTotales += await compter(src, table)
  }
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
  suivi.etape = 'Fichiers Storage'
  for (const [i, object] of objects.entries()) {
    const nom = digest(JSON.stringify([object.bucket_id, object.name])) + '.bin'
    suivi.detail = `${i + 1}/${objects.length} fichier(s) : ${object.bucket_id}/${object.name}`
    const existant = relire(nom)
    if (existant) manifest.files[nom] = digest(existant)
    else save(nom, await remote.telecharger(object.bucket_id, object.name))
    console.log(`Fichiers : ${i + 1}/${objects.length}`)
  }
  const current = await remote.sql('select * from storage.objects order by bucket_id, name')
  if (JSON.stringify(current) !== JSON.stringify(objects)) throw new Error('Le stockage a change pendant la copie. Relancez hors utilisation.')
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2))
  new ArchiveSource(folder)
  arreterSuivi()
  console.log('Export verifie : comptes, schema public, donnees et fichiers Storage.')
}

// Garde-fou : l'import ne modifie jamais la configuration locale de l'installation (local/.env avec les
// clés JWT/ANON/SERVICE, et .env.local à la racine). Si l'un de ces fichiers change pendant l'import, erreur.
const DOSSIER_ARCHIVE = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_LOCALE = [path.resolve(DOSSIER_ARCHIVE, '..', '.env'), path.resolve(DOSSIER_ARCHIVE, '..', '..', '.env.local')]
const empreinteConfig = () => CONFIG_LOCALE.map((f) => (fs.existsSync(f) ? digest(fs.readFileSync(f)) : 'absent')).join('|')
async function importerProtege(folder) {
  const avant = empreinteConfig()
  await migrer(new ArchiveSource(folder))
  if (empreinteConfig() !== avant) throw new Error('La configuration locale (.env) a change pendant l\'import : arret. Verifiez l\'installation avant de relancer.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, folder] = process.argv.slice(2)
    if (!folder) throw new Error('Dossier archive requis')
    if (action === 'export') await exporter(folder)
    else if (action === 'verify') { new ArchiveSource(folder); console.log('Archive verifiee') }
    else if (action === 'import') await importerProtege(folder)
    else throw new Error('Action attendue : export, verify ou import')
  } catch (e) { console.error(e.message); process.exit(1) }
}
