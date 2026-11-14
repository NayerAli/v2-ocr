// Next inlines NEXT_PUBLIC_* at build time, including into middleware.
const fs = require('node:fs')
const path = require('node:path')

const token = 'V2OCR_PUBLIC_ANON_KEY_70E3788B645D'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!key || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) {
  throw new Error('Cle publique Supabase locale absente ou invalide')
}

function replaceIn(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name)
    if (entry.isDirectory()) replaceIn(name)
    else if (entry.isFile() && /\.(?:js|json|html|rsc|body|meta)$/.test(name)) {
      const content = fs.readFileSync(name, 'utf8')
      if (content.includes(token)) fs.writeFileSync(name, content.replaceAll(token, key))
    }
  }
}

replaceIn('/opt/.next')
require('/projet-relay.cjs')
