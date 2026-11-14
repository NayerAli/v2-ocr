import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, rename, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { pathToFileURL } from 'node:url'

const magic = Buffer.from('V2OCR-GCM-1\n')
const headerSize = magic.length + 12
const tagSize = 16

export async function crypt(mode, input, output, encodedKey) {
  const key = Buffer.from(encodedKey.trim(), 'base64')
  if (key.length !== 32 || key.toString('base64') !== encodedKey.trim()) throw new Error('Code de migration invalide')
  const temporary = output + '.part'
  try {
    if (mode === 'encrypt') {
      const header = Buffer.concat([magic, randomBytes(12)])
      const cipher = createCipheriv('aes-256-gcm', key, header.subarray(magic.length))
      cipher.setAAD(header)
      const file = await open(temporary, 'wx', 0o600)
      try { await file.writeFile(header) } finally { await file.close() }
      const appendTag = new Transform({
        transform(chunk, encoding, callback) { callback(null, chunk) },
        flush(callback) { callback(null, cipher.getAuthTag()) },
      })
      await pipeline(createReadStream(input), cipher, appendTag, createWriteStream(temporary, { flags: 'a' }))
    } else if (mode === 'decrypt') {
      const file = await open(input, 'r')
      const header = Buffer.alloc(headerSize)
      const tag = Buffer.alloc(tagSize)
      let size
      try {
        size = (await file.stat()).size
        if (size <= headerSize + tagSize) throw new Error('Archive chiffree incomplete')
        await file.read(header, 0, header.length, 0)
        await file.read(tag, 0, tag.length, size - tag.length)
      } finally { await file.close() }
      if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Archive chiffree invalide')
      const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length))
      decipher.setAAD(header)
      decipher.setAuthTag(tag)
      await pipeline(
        createReadStream(input, { start: headerSize, end: size - tagSize - 1 }),
        decipher,
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      )
    } else {
      throw new Error('Action de chiffrement inconnue')
    }
    await rename(temporary, output)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  } finally { key.fill(0) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, input, output] = process.argv.slice(2)
    let key = ''
    for await (const chunk of process.stdin.setEncoding('utf8')) {
      key += chunk
      if (key.length > 128) throw new Error('Code de migration invalide')
    }
    await crypt(mode, input, output, key)
  } catch {
    console.error('Echec du chiffrement ou du dechiffrement. Verifiez le code de migration et le fichier.')
    process.exitCode = 1
  }
}
