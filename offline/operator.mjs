// Runs only in a disposable, digest-pinned Node container on the operator PC.
import { createHash, createHmac, generateKeyPairSync, createPublicKey, randomBytes, sign, verify } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir, cp, rm, stat, open, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { createGzip } from 'node:zlib'
import { crypt } from './crypt.mjs'

export const host = 'https://v2-ocr-distribution.nayer-v2-ocr.workers.dev'
const account = '6dc7ec0909723c23701b56e6de1b0498'
const bucket = 'v2-ocr-offline-installer'
const sha = data => createHash('sha256').update(data).digest('hex')
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const save = async (file, data) => { await writeFile(file + '.new', JSON.stringify(data, null, 2), { mode: 0o600 }); await rename(file + '.new', file) }
export async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const data of createReadStream(file)) hash.update(data)
  return hash.digest('hex')
}
export async function segment(file, root, bytes = 64 * 1024 * 1024) {
  await mkdir(join(root, 'objects'), { recursive: true })
  const input = await open(file)
  const full = createHash('sha256'), parts = []
  let size = 0
  try {
    const buf = Buffer.alloc(bytes)
    for (;;) {
      let count = 0
      while (count < bytes) {
        const got = (await input.read(buf, count, bytes - count, null)).bytesRead
        if (!got) break
        count += got
      }
      if (!count) break
      const data = buf.subarray(0, count), digest = sha(data), key = `objects/${digest}`
      full.update(data); size += count
      await writeFile(join(root, key), data, { mode: 0o600 })
      parts.push({ key, sha256: digest, size: count })
      console.log(`Segment prepare : ${parts.length} (${size} octets)`)
    }
  } finally { await input.close() }
  if (!size) throw new Error('Archive vide')
  return { size, sha256: full.digest('hex'), parts }
}
export function signedManifest(manifest, privateKey) {
  const payload = Buffer.from(JSON.stringify(manifest))
  return { payload: payload.toString('base64'), signature: sign('sha256', payload, privateKey).toString('base64') }
}
export function readManifest(envelope, privateKey) {
  const payload = Buffer.from(envelope.payload, 'base64')
  if (!verify('sha256', payload, createPublicKey(privateKey), Buffer.from(envelope.signature, 'base64'))) throw new Error('Signature distante incorrecte')
  return JSON.parse(payload)
}
export function makeInstaller(template, common, channel, privateKey) {
  const n = createPublicKey(privateKey).export({ format: 'jwk' }).n
  return template.replace('__RELEASE_URL__', `${host}/${channel}/manifest.json`)
    .replace('__RSA_MODULUS__', Buffer.from(n, 'base64url').toString('base64'))
    .replace('# __WINDOWS_COMMON__', () => common)
}
function replaceOne(text, old, replacement) {
  if (text.split(old).length !== 2) throw new Error(`Compose incompatible : ${old}`)
  return text.replace(old, replacement)
}
export function makeCompose(text, mapping, app) {
  text = text.replace(/^    image: (\S+)$/gm, (_, name) => {
    if (!mapping[name]) throw new Error(`Image non verrouillee : ${name}`)
    return `    image: ${mapping[name]}`
  })
  for (const [old, replacement] of [
    ['    build:\n      context: ..\n      target: prod', `    image: ${app}`],
    ['    env_file: ../.env.local', '    env_file: "${OCR_STATE}/.env.local"'],
    ['      - ./relais-supabase.cjs:/opt/relais-supabase.cjs:ro', '      - ./relais-supabase.cjs:/projet-relay.cjs:ro\n      - ./runtime-config.cjs:/runtime-config.cjs:ro'],
    ['command: ["node", "/opt/relais-supabase.cjs"]', 'command: ["node", "/runtime-config.cjs"]'],
    ['      - ..:/projet', '      - "${OCR_STATE}:/projet"\n      - ./assistant:/projet/local/assistant:ro'],
    ['GOTRUE_DISABLE_SIGNUP: "false"', 'GOTRUE_DISABLE_SIGNUP: "true"'],
  ]) text = replaceOne(text, old, replacement)
  return text
}
async function tar(args, progress) {
  const child = spawn('tar', args, { stdio: 'inherit' })
  let lastSize = -1, lastChange = Date.now()
  const timer = setInterval(async () => {
    const size = (await stat(progress).catch(() => ({ size: 0 }))).size
    if (size !== lastSize) { lastSize = size; lastChange = Date.now(); console.log(`Archive : ${size} octets`) }
    if (Date.now() - lastChange > 120000) child.kill('SIGKILL')
  }, 10000)
  try { await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Archive tar interrompue (code ${code})`)))
  }) } finally { clearInterval(timer) }
}
export function s3Headers(method, url, bodyHash, credentials, extra = {}, now = new Date()) {
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const scope = `${date.slice(0, 8)}/auto/s3/aws4_request`
  const headers = { host: url.host, 'x-amz-content-sha256': bodyHash, 'x-amz-date': date, ...extra }
  const names = Object.keys(headers).sort()
  const canonical = [method, url.pathname, '', names.map(k => `${k}:${headers[k].trim()}\n`).join(''), names.join(';'), bodyHash].join('\n')
  const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
  let key = Buffer.from('AWS4' + credentials.secretAccessKey)
  for (const item of [date.slice(0, 8), 'auto', 's3', 'aws4_request']) key = hmac(key, item)
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(key, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`).toString('hex')}`
  return headers
}
export async function s3(method, key, credentials, { file, data, extra = {} } = {}) {
  const url = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`)
  const hash = file ? await hashFile(file) : sha(data || '')
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController()
    let timer, source
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30000) }
    try {
      reset()
      const headers = s3Headers(method, url, hash, credentials, extra)
      let body = data
      if (file) {
        headers['content-length'] = String((await stat(file)).size)
        source = createReadStream(file)
        body = source.pipe(new Transform({ transform(chunk, encoding, callback) { reset(); callback(null, chunk) } }))
      }
      const response = await fetch(url, { method, headers, body, duplex: body ? 'half' : undefined, signal: controller.signal, redirect: 'error' })
      reset()
      const text = await response.text()
      if (!response.ok && response.status !== 404 && response.status !== 412) {
        const error = new Error(`R2 ${method} HTTP ${response.status}`)
        error.permanent = response.status < 500 && response.status !== 429
        throw error
      }
      return { status: response.status, etag: response.headers.get('etag'), text,
        hash: response.headers.get('x-amz-meta-sha256'), size: Number(response.headers.get('content-length')) }
    } catch (error) {
      console.error(`R2 : tentative ${attempt}/3 en echec (${error.message}).`)
      if (error.permanent || attempt === 3) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 2000))
    } finally { clearTimeout(timer); source?.destroy() }
  }
}
async function publish(work, config, secrets, credentials) {
  const output = join(work, 'package'), envelope = await json(join(output, 'manifest.json'))
  const manifest = readManifest(envelope, secrets.privateKey)
  const key = `${config.channel}/manifest.json`
  const remote = await s3('GET', key, credentials)
  if (remote.status === 200) {
    if (remote.text === JSON.stringify(envelope)) return console.log('Publication deja terminee.')
    const old = readManifest(JSON.parse(remote.text), secrets.privateKey)
    if (old.sequence >= manifest.sequence) throw new Error('Conflit de publication : la version distante est plus recente. Aucune modification distante.')
  } else if (remote.status !== 404) throw new Error('Lecture du canal refusee')
  for (const archive of Object.values(manifest.archives)) for (const part of archive.parts) {
    const objectKey = `${config.channel}/${part.key}`
    const present = await s3('HEAD', objectKey, credentials)
    if (present.status === 200) {
      if (present.size !== part.size || present.hash !== part.sha256) throw new Error('Objet distant incoherent : publication arretee')
      continue
    }
    if (present.status !== 404) throw new Error('Verification R2 impossible')
    const file = join(output, part.key)
    if (await hashFile(file) !== part.sha256) throw new Error('Segment local corrompu')
    console.log(`Envoi R2 : ${part.sha256.slice(0, 12)} (${part.size} octets)`)
    const sent = await s3('PUT', objectKey, credentials, { file, extra: { 'if-none-match': '*', 'x-amz-meta-sha256': part.sha256 } })
    if (sent.status !== 200) throw new Error('Conflit pendant le transfert R2. Relancer la meme commande.')
  }
  // Same URL and same signing identity on each release. All objects precede manifest publication.
  const bootstrapKey = `${config.channel}/install.ps1`
  const previous = await s3('HEAD', bootstrapKey, credentials)
  if (![200, 404].includes(previous.status)) throw new Error('Lecture du lanceur refusee')
  const uploaded = await s3('PUT', bootstrapKey, credentials, { file: join(output, 'install.ps1'), extra: {
    'content-type': 'text/plain; charset=utf-8', ...(previous.status === 200 ? { 'if-match': previous.etag } : { 'if-none-match': '*' }),
  } })
  if (uploaded.status !== 200) throw new Error('Conflit sur le lanceur')
  const committed = await s3('PUT', key, credentials, { data: JSON.stringify(envelope), extra: {
    'content-type': 'application/json', ...(remote.status === 200 ? { 'if-match': remote.etag } : { 'if-none-match': '*' }),
  } })
  if (committed.status !== 200) throw new Error('Conflit sur le manifeste : publication non activee')
  const check = await s3('GET', key, credentials)
  if (check.text !== JSON.stringify(envelope)) throw new Error('Verification apres publication en echec')
  console.log('Publication R2 verifiee.')
}
async function packageRelease(source, work, config, secrets) {
  const stage = join(work, 'stage'), output = join(work, 'package')
  await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true }); await mkdir(output, { recursive: true })
  const images = await json(join(work, 'images.json'))
  for (const name of ['assistant', 'supabase']) await cp(join(source, 'local', name), join(stage, name), { recursive: true })
  for (const [from, to] of [['local/relais-supabase.cjs', 'relais-supabase.cjs'], ['offline/runtime-config.cjs', 'runtime-config.cjs'], ['offline/crypt.mjs', 'crypt.mjs']]) await cp(join(source, from), join(stage, to))
  const compose = makeCompose((await readFile(join(source, 'local/docker-compose.yml'), 'utf8')).replace(/\r\n/g, '\n'), images.mapping, images.app)
  await writeFile(join(stage, 'compose.yml'), compose)
  await save(join(stage, 'images.json'), images)
  const runtime = join(work, 'runtime.tar.gz')
  await tar(['-czf', runtime, '-C', stage, '.'], runtime)
  const archives = { runtime: await segment(runtime, output) }
  // gzip uses a fixed header and mtime, preserving content-addressed segments across retries.
  const zipped = join(work, 'images.tar.gz')
  let bytes = 0
  const pulse = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(null, chunk) } })
  const report = setInterval(() => console.log(`Compression images : ${bytes} octets`), 10000)
  try { await pipeline(createReadStream(join(work, 'images.tar')), pulse, createGzip({ level: 1 }), createWriteStream(zipped)) }
  finally { clearInterval(report) }
  archives.images = await segment(zipped, output)
  if (config.migration) archives.migration = config.migration
  else {
    const payload = join(work, 'export/payload'), metadata = await json(join(payload, 'manifest.json'))
    if (metadata.format !== 'ocr-offline-1' || metadata.filtre?.perimetre !== 'comptes choisis' || metadata.filtre?.comptes !== 1 || metadata.filtre?.politique !== 'client-isole-v2') throw new Error('Un export verifie pour un seul compte, avec exclusion des parametres partages, est requis')
    const major = Math.floor(Number(metadata.postgresVersion) / 10000)
    if (major < 14 || major > 17) throw new Error(`PostgreSQL source ${major} non pris en charge par ce convertisseur logique`)
    const files = ['manifest.json', ...Object.keys(metadata.files).sort()]
    for (const file of files.slice(1)) {
      if (!/^[a-f0-9]{64}\.(json|bin)$/.test(file) || await hashFile(join(payload, file)) !== metadata.files[file]) throw new Error('Export endommage')
    }
    await writeFile(join(work, 'file-list'), files.join('\n') + '\n')
    const plain = join(work, 'migration.tar'), encrypted = join(work, 'migration.enc')
    try {
      await tar(['-cf', plain, '-C', payload, '-T', join(work, 'file-list')], plain)
      await rm(encrypted + '.part', { force: true })
      await crypt('encrypt', plain, encrypted, secrets.migrationKey)
      archives.migration = await segment(encrypted, output)
    } finally { await rm(plain, { force: true }) }
  }
  const manifest = { format: 1, version: `windows-${config.sequence}`, sequence: config.sequence, commit: config.commit, archives }
  const common = await readFile(join(source, 'offline/windows-common.ps1'), 'utf8')
  const installer = makeInstaller(await readFile(join(source, 'offline/install.ps1'), 'utf8'), await readFile(join(source, 'offline/windows-common.ps1'), 'utf8'), config.channel, secrets.privateKey)
  await writeFile(join(output, 'install.ps1'), installer.replaceAll('__UNINSTALL_BASE64__', Buffer.from((await readFile(join(source, 'offline/uninstall.ps1'), 'utf8')).replace('# __WINDOWS_COMMON__', () => common)).toString('base64')))
  await save(join(output, 'manifest.json'), signedManifest(manifest, secrets.privateKey))
  console.log('Paquet chiffre, segmente et signe.')
}
// Accept a corrected preparer on the same channel without resending a validated migration.
export async function refreshPending(work, config, secrets) {
  const manifestFile = join(work, 'package/manifest.json')
  const previous = await json(manifestFile).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (previous) {
    const verified = readManifest(previous, secrets.privateKey)
    config.migration = verified.archives.migration || config.migration
    config.sequence = Math.max(config.sequence, verified.sequence + 1)
  }
  // Persist retained descriptors before removing the old publication marker.
  await save(join(work, 'job.json'), config)
  await rm(manifestFile, { force: true })
  if (!config.migration) await rm(join(work, 'export/payload/manifest.json'), { force: true })
  config.refreshRequired = false
  await save(join(work, 'job.json'), config)
  console.log('Correctif applique a la preparation ; canal et export chiffre conserves.')
}
async function main() {
  const [action, source, work] = process.argv.slice(2)
  if (action === 'identity') {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
    console.log(JSON.stringify({ channel: randomBytes(32).toString('hex'), privateKey, migrationKey: randomBytes(32).toString('base64') }))
    return
  }
  let input = ''
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 65536) throw new Error('Entree de preparation invalide') }
  const { secrets, credentials } = JSON.parse(input)
  const config = await json(join(work, 'job.json'))
  if (config.channel !== secrets.channel) throw new Error('Cle de signature associee a un autre canal')
  if (!/^[a-f0-9]{64}$/.test(config.channel) || !/^[a-f0-9]{40}$/.test(config.commit) || !Number.isSafeInteger(config.sequence) || config.sequence < 1) throw new Error('Identite de publication invalide')
  if (action === 'refresh') await refreshPending(work, config, secrets)
  else if (action === 'package') await packageRelease(source, work, config, secrets)
  else if (action === 'publish' || action === 'check') {
    if (!/^[a-f0-9]{32}$/i.test(credentials.accessKeyId) || !/^[a-f0-9]{64}$/i.test(credentials.secretAccessKey)) throw new Error('Identifiants S3 R2 invalides')
    if (action === 'publish') await publish(work, config, secrets, credentials)
    else {
      const response = await s3('HEAD', `${config.channel}/manifest.json`, credentials)
      if (![200, 404].includes(response.status)) throw new Error('Acces R2 refuse')
      console.log('Acces R2 confirme.')
    }
  } else throw new Error('Action inconnue')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
