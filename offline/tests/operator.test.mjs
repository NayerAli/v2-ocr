import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { segment, signedManifest, readManifest, makeInstaller, makeCompose, s3Headers, s3 } from '../operator.mjs'
import { extraireCles, predicatCopie, tablePartagee, parserChoix } from '../../local/assistant/export-filtre.mjs'

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
test('same channel command and trust root survive an installer correction', async () => {
  const a = 'a'.repeat(64)
  const template = await readFile(new URL('../install.ps1', import.meta.url), 'utf8')
  const common = await readFile(new URL('../windows-common.ps1', import.meta.url), 'utf8')
  const first = makeInstaller(template, common, a, keys.privateKey)
  const second = makeInstaller(template + '\n# correction', common, a, keys.privateKey)
  const identity = code => code.match(/\$ReleaseUrl = '[^']+'|\$PublicModulus = '[^']+'/g)
  assert.deepEqual(identity(first), identity(second))
  assert.ok(first.includes(`/${a}/manifest.json`))
  assert.ok(!first.includes('__RSA_MODULUS__'))
  assert.ok(!first.includes('PRIVATE KEY'))
  const signed = signedManifest({ sequence: 1 }, keys.privateKey)
  assert.equal(readManifest(signed, keys.privateKey).sequence, 1)
  assert.throws(() => readManifest({ ...signed, payload: Buffer.from('{"sequence":2}').toString('base64') }, keys.privateKey))
})
test('shared settings cannot be exported; per-user OCR keys remain detectable', () => {
  for (const table of ['public.settings','public."settings"','public.public_settings','public.system_settings']) {
    assert.equal(tablePartagee(table), true)
    assert.equal(predicatCopie(table, 't'), 'FALSE')
  }
  assert.equal(tablePartagee('public.user_settings'), false)
  const secret = 'client-key-123456789'
  assert.deepEqual(extraireCles({ ocr: { geminiApiKey: secret, api_keys: ['second-client-key'] } }).map(x => x.valeur), [secret, 'second-client-key'])
  assert.deepEqual(parserChoix('2', 3), [1])
})
test('segmentation reassembles exactly and replaces a corrupted cached segment', async () => {
  const work = await mkdtemp(join(tmpdir(), 'v2ocr-operator-'))
  try {
    const bytes = Buffer.from('abcdabcdxyz')
    await writeFile(join(work, 'input'), bytes)
    const first = await segment(join(work, 'input'), work, 4)
    await writeFile(join(work, first.parts[0].key), 'corrupt')
    const second = await segment(join(work, 'input'), work, 4)
    assert.deepEqual(second, first)
    assert.deepEqual(Buffer.concat(await Promise.all(second.parts.map(p => readFile(join(work, p.key))))), bytes)
    assert.equal(second.sha256, createHash('sha256').update(bytes).digest('hex'))
  } finally { await rm(work, { recursive: true, force: true }) }
})
test('generated Compose has no build or mutable service image and isolates configuration', async () => {
  const source = await readFile(new URL('../../local/docker-compose.yml', import.meta.url), 'utf8')
  const mapping = Object.fromEntries([...source.matchAll(/^    image: (\S+)$/gm)].map(([, name], i) => [name, `v2ocr-offline/service:${String(i).padStart(64,'a')}`]))
  const compose = makeCompose(source, mapping, 'v2ocr-offline/app:' + 'b'.repeat(64))
  assert.ok(!compose.includes('    build:'))
  assert.ok(compose.includes('"${OCR_STATE}/.env.local"'))
  assert.ok(compose.includes('GOTRUE_DISABLE_SIGNUP: "true"'))
  assert.throws(() => makeCompose(source, {}, 'app'))
})
test('R2 signing binds method, content hash and optimistic concurrency', () => {
  const url = new URL('https://example.r2.cloudflarestorage.com/bucket/key')
  const credentials = { accessKeyId: 'a'.repeat(32), secretAccessKey: 'b'.repeat(64) }
  const date = new Date('2026-11-14T09:10:11Z')
  const first = s3Headers('PUT', url, 'c'.repeat(64), credentials, { 'if-none-match': '*' }, date)
  assert.match(first.authorization, /20261114\/auto\/s3\/aws4_request/)
  assert.match(first.authorization, /SignedHeaders=host;if-none-match;x-amz-content-sha256;x-amz-date/)
  assert.notEqual(first.authorization, s3Headers('PUT', url, 'd'.repeat(64), credentials, { 'if-none-match': '*' }, date).authorization)
  assert.notEqual(first.authorization, s3Headers('GET', url, 'c'.repeat(64), credentials, {}, date).authorization)
})
test('R2 authorization failures stop without retry; transient failures retry', async () => {
  const original = globalThis.fetch
  let calls = 0
  const credentials = { accessKeyId: 'a'.repeat(32), secretAccessKey: 'b'.repeat(64) }
  try {
    globalThis.fetch = async () => { calls++; return new Response('', { status: 403 }) }
    await assert.rejects(s3('HEAD', 'a'.repeat(64) + '/manifest.json', credentials), /HTTP 403/)
    assert.equal(calls, 1)
    calls = 0
    globalThis.fetch = async () => { calls++; return new Response('', { status: calls === 1 ? 503 : 404 }) }
    assert.equal((await s3('HEAD', 'a'.repeat(64) + '/manifest.json', credentials)).status, 404)
    assert.equal(calls, 2)
  } finally { globalThis.fetch = original }
})

test('complete package generation uses only verified client files and embeds self-contained Windows scripts', async () => {
  const { mkdir } = await import('node:fs/promises')
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const source = fileURLToPath(new URL('../../', import.meta.url))
  const work = await mkdtemp(join(tmpdir(), 'v2ocr-package-'))
  try {
    const data = Buffer.from('synthetic client document')
    const hash = createHash('sha256').update(data).digest('hex'), filename = hash + '.bin'
    await mkdir(join(work, 'export/payload'), { recursive: true })
    await writeFile(join(work, 'export/payload', filename), data)
    await writeFile(join(work, 'export/payload', 'manifest.json'), JSON.stringify({ format: 'ocr-offline-1', postgresVersion: '150008',
      filtre: { perimetre: 'comptes choisis', comptes: 1, politique: 'client-isole-v2' }, files: { [filename]: hash } }))
    const compose = await readFile(join(source, 'local/docker-compose.yml'), 'utf8')
    const mapping = Object.fromEntries([...compose.matchAll(/^    image: (\S+)$/gm)].map(([, name]) => [name, 'fixture/service:test']))
    await writeFile(join(work, 'images.json'), JSON.stringify({ mapping, app: 'fixture/app:test', ids: {}, helper: 'fixture/node:test' }))
    await writeFile(join(work, 'images.tar'), Buffer.alloc(2048))
    await writeFile(join(work, 'job.json'), JSON.stringify({ channel: 'a'.repeat(64), commit: 'b'.repeat(40), sequence: 1 }))
    const secretInput = JSON.stringify({ secrets: { channel: 'a'.repeat(64), privateKey: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), migrationKey: Buffer.alloc(32, 7).toString('base64') } })
    const result = spawnSync(process.execPath, [join(source, 'offline/operator.mjs'), 'package', source, work], { encoding: 'utf8', timeout: 30000, input: secretInput })
    assert.equal(result.status, 0, result.stderr)
    const envelope = JSON.parse(await readFile(join(work, 'package/manifest.json'), 'utf8'))
    const manifest = readManifest(envelope, keys.privateKey)
    assert.deepEqual(Object.keys(manifest.archives).sort(), ['images','migration','runtime'])
    const installer = await readFile(join(work, 'package/install.ps1'), 'utf8')
    for (const marker of ['__RELEASE_URL__','__RSA_MODULUS__','__UNINSTALL_BASE64__','# __WINDOWS_COMMON__']) assert.ok(!installer.includes(marker), marker)
    assert.ok(!installer.includes('PRIVATE KEY'))
    const cipher = await readFile(join(work, 'migration.enc'))
    assert.ok(!cipher.includes(data))
  } finally { await rm(work, { recursive: true, force: true }) }
})
