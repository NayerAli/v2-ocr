import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import worker from '../distribution.mjs'
import { crypt } from '../crypt.mjs'

test('encrypted archive round trip and rejection of damaged data and wrong keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'v2ocr-'))
  const plain = join(root, 'plain')
  const cipher = join(root, 'encrypted')
  const restored = join(root, 'restored')
  const key = randomBytes(32).toString('base64')
  const data = randomBytes(3 * 1024 * 1024)
  try {
    await writeFile(plain, data)
    await crypt('encrypt', plain, cipher, key)
    const encrypted = await readFile(cipher)
    assert.ok(!encrypted.includes(data.subarray(0, 64)))
    await crypt('decrypt', cipher, restored, key)
    assert.deepEqual(await readFile(restored), data)
    await rm(restored)
    await assert.rejects(crypt('decrypt', cipher, restored, randomBytes(32).toString('base64')))
    encrypted[encrypted.length - 1] ^= 1
    await writeFile(cipher, encrypted)
    await assert.rejects(crypt('decrypt', cipher, restored, key))
    assert.deepEqual((await readdir(root)).sort(), ['encrypted', 'plain'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('gateway serves only channel objects and supports exact resume ranges', async () => {
  const value = 'abcdefghijklmnop'
  const channel = 'a'.repeat(64)
  const object = 'b'.repeat(64)
  const path = `/${channel}/objects/${object}`
  const key = path.slice(1)
  const info = { size: value.length, etag: 'etag', httpEtag: '"etag"' }
  const bucket = {
    async head(name) { return name === key ? info : null },
    async get(name, { range, onlyIf }) {
      assert.equal(name, key)
      assert.equal(onlyIf.etagMatches, info.etag)
      return { body: range ? value.slice(range.offset, range.offset + range.length) : value }
    },
  }
  const request = (target, headers, method) => worker.fetch(
    new Request('https://installer.example' + target, { headers, method }), { RELEASES: bucket })
  const full = await request(path)
  assert.equal(full.status, 200)
  assert.equal(await full.text(), value)
  assert.equal(full.headers.get('cache-control'), 'private, no-store')
  const metadata = await request(path, {}, 'HEAD')
  assert.equal(metadata.headers.get('content-length'), String(value.length))
  assert.equal(await metadata.text(), '')
  const resumed = await request(path, { Range: 'bytes=6-' })
  assert.equal(resumed.status, 206)
  assert.equal(resumed.headers.get('content-range'), 'bytes 6-15/16')
  assert.equal(value.slice(0, 6) + await resumed.text(), value)
  assert.equal((await request(path, { Range: 'bytes=16-' })).status, 416)
  assert.equal((await request(path.replace(object, 'c'.repeat(64)))).status, 404)
  assert.equal((await request('/manifest.json')).status, 404)
  assert.equal((await request(path, {}, 'PUT')).status, 405)
})
