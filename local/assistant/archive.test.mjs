import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ArchiveSource, exporter } from './archive.mjs'
import { lireStructure, colonnesSource, copierTable, compter } from './assistant.mjs'

test('offline export replays migration queries and bytes without network', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-test-'))
  const objects = [{ bucket_id: 'documents', name: '../doc avec espaces.pdf' }]
  const remote = {
    async sql(q) {
      if (q.includes('select * from storage.objects')) return objects
      if (q.includes('select count(*)')) return [{ n: 1 }]
      if (q.includes('select a.attname as nom')) return [{ nom: 'id' }]
      if (q.includes('t.ctid::text')) return q.includes("'(0,0)'") ? [{ _ctid: '(0,1)', r: { id: '123' } }] : []
      return []
    },
    async telecharger() { return Buffer.from([0, 255, 10, 128]) }
  }
  try {
    await exporter(folder, remote)
    const archive = new ArchiveSource(folder)
    assert.deepEqual(await lireStructure(archive), await lireStructure(remote))
    assert.equal(await compter(archive, 'auth.users'), 1)
    for (const q of ['auth.users', 'auth.identities', 'storage.buckets']) {
      const cols = await colonnesSource(archive, q)
      const inserted = []
      const db = { query: async (sql, params) => {
        if (sql.startsWith('insert into')) inserted.push(...JSON.parse(params[0]))
        return { rows: [{ nom: 'id' }] }
      } }
      assert.equal(await copierTable(archive, db, q, cols), 1)
      assert.deepEqual(inserted, [{ id: '123' }])
    }
    assert.deepEqual(await archive.telecharger('documents', '../doc avec espaces.pdf'), Buffer.from([0,255,10,128]))
    await assert.rejects(archive.sql('select missing'), /absent/)
    const entry = Object.keys(archive.manifest.files)[0]
    fs.appendFileSync(path.join(folder, entry), 'corruption')
    assert.throws(() => new ArchiveSource(folder), /endommagee/)
  } finally { fs.rmSync(folder, { recursive: true, force: true }) }
})

test('failed export never produces a valid manifest', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-test-'))
  try {
    await assert.rejects(exporter(folder, { sql: async () => { throw new Error('reseau indisponible') } }), /reseau/)
    assert.equal(fs.existsSync(path.join(folder, 'manifest.json')), false)
  } finally { fs.rmSync(folder, { recursive: true, force: true }) }
})
