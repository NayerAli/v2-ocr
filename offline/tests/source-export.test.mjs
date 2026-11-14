import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ArchiveSource } from '../../local/assistant/archive.mjs'

test('native exporter probes the source and retains the selected account documents', async () => {
  const selected = '5a88d58d-d082-4184-9fa5-3faca322c824'
  const excluded = '88e770ed-744e-4934-bd88-dae14214d7c5'
  const doc = { bucket_id: 'documents', name: selected + '/scan.pdf', metadata: { size: 4 } }
  const accounts = [selected, excluded].map((id, i) => ({ id, email: `fixture${i}@example.test` }))
  const records = {
    'auth.users': { id: selected },
    'auth.identities': { id: 'identity', user_id: selected },
    'public.documents': { id: 'document', user_id: selected },
    'storage.buckets': { id: 'documents' },
  }
  const clauses = []
  const server = createServer(async (request, response) => {
    if (request.url === '/auth/v1/health') {
      assert.equal(request.headers.authorization, undefined)
      response.writeHead(401).end()
      return
    }
    if (request.url === '/storage/v1/object/documents/' + doc.name) {
      response.end(Buffer.from([0, 1, 2, 3]))
      return
    }
    if (request.url === '/storage/v1/bucket') {
      response.end('[]')
      return
    }
    if (request.url !== '/pg/query') {
      response.writeHead(404).end()
      return
    }
    let body = ''
    for await (const part of request) body += part
    const { query } = JSON.parse(body)
    const sql = query.slice(query.lastIndexOf(';') + 1).trim().replace(/\s+/g, ' ')
    clauses.push(sql)
    let rows = []
    if (sql === 'select 1 as ok') rows = [{ ok: 1 }]
    else if (sql.startsWith('select current_setting')) rows = [{ version_num: '150008' }]
    else if (sql.startsWith('select c.oid::int as oid')) rows = [{ oid: 1, q: 'public.documents' }]
    else if (sql.startsWith('select a.attrelid::int as oid')) rows = ['id','user_id'].map(nom => ({ oid: 1, nom, type: 'uuid' }))
    else if (sql.startsWith('select a.attname as nom')) rows = ['id','user_id','owner_id'].map(nom => ({ nom }))
    else if (sql.startsWith('select id::text as id, email')) rows = accounts
    else if (sql.startsWith('select * from storage.objects')) rows = sql.includes(selected) ? [doc] : []
    else if (sql.startsWith('select t.ctid::text')) {
      const table = sql.match(/ from (\S+) t/)[1]
      if (sql.includes("'(0,0)'") && sql.includes(selected)) rows = [{ _ctid: '(0,1)', r: records[table] }]
    } else if (sql.startsWith('select count(*)')) {
      rows = [{ n: sql.includes(selected) ? 1 : 0 }]
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(rows))
  })
  const work = await mkdtemp(join(tmpdir(), 'ocr-source-'))
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const host = `127.0.0.1:${server.address().port}`
    const exe = fileURLToPath(new URL('../../local/assistant/export-filtre.mjs', import.meta.url))
    const run = (args, extraEnv = {}) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [exe, ...args], {
        env: { ...process.env, OCR_ADRESSE: host, ...extraEnv }, timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.on('data', bytes => { output += bytes })
      child.stderr.on('data', bytes => { output += bytes })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve(output) : reject(new Error(output)))
    })
    assert.match(await run(['--verifier-adresse']), /HTTP 401/)
    const config = join(work, 'selection.json')
    await writeFile(config, JSON.stringify({ comptes: [accounts[0].email] }))
    await run([work, '--config', config, '--oui'], { OCR_CLIENT_EXPORT: '1', OCR_CLE: 'sb_secret_fixture' })
    const archive = new ArchiveSource(join(work, 'payload'))
    assert.equal(archive.manifest.counts['public.documents'], 1)
    assert.equal(archive.manifest.counts['auth.identities'], 1)
    assert.deepEqual(await archive.telecharger('documents', doc.name), Buffer.from([0, 1, 2, 3]))
    assert.ok(clauses.some(sql => sql.startsWith('select * from storage.objects') && sql.includes('t."owner_id"')))
    assert.ok(clauses.some(sql => sql.includes('from public.documents t where') && sql.includes('t."user_id"')))
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(work, { recursive: true, force: true })
  }
})
