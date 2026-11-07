// Copie tous les fichiers du Storage (bucket "ocr-documents" et les autres)
// de l'ancien Supabase vers le nouveau. Les fichiers déjà présents sont écrasés,
// le script peut donc être relancé sans risque.
//
// Usage :
//   ANCIEN_SUPABASE_URL=https://ancien.exemple.com \
//   ANCIENNE_SERVICE_KEY=xxx \
//   NOUVEAU_SUPABASE_URL=https://REF.supabase.co \
//   NOUVELLE_SERVICE_KEY=yyy \
//   node scripts/migration/migrer-fichiers.mjs
import { createClient } from '@supabase/supabase-js'

const need = (k) => {
  if (!process.env[k]) { console.error(`Variable manquante : ${k}`); process.exit(1) }
  return process.env[k]
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const ancien = createClient(need('ANCIEN_SUPABASE_URL'), need('ANCIENNE_SERVICE_KEY'), opts)
const nouveau = createClient(need('NOUVEAU_SUPABASE_URL'), need('NOUVELLE_SERVICE_KEY'), opts)

// Liste récursivement tous les fichiers d'un bucket.
async function listerFichiers(bucket, prefixe = '') {
  const fichiers = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await ancien.storage.from(bucket).list(prefixe, { limit: 1000, offset })
    if (error) throw new Error(`Liste ${bucket}/${prefixe} : ${error.message}`)
    for (const item of data) {
      const chemin = prefixe ? `${prefixe}/${item.name}` : item.name
      if (item.id === null) fichiers.push(...await listerFichiers(bucket, chemin)) // dossier
      else fichiers.push({ chemin, type: item.metadata?.mimetype })
    }
    if (data.length < 1000) break
  }
  return fichiers
}

const { data: buckets, error } = await ancien.storage.listBuckets()
if (error) throw error

let total = 0, echecs = 0
for (const b of buckets) {
  // Crée le bucket s'il n'existe pas encore (il peut déjà venir de la migration SQL).
  const { error: e } = await nouveau.storage.createBucket(b.id, {
    public: b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  })
  if (e && !/exist/i.test(e.message)) throw new Error(`Bucket ${b.id} : ${e.message}`)

  const fichiers = await listerFichiers(b.id)
  console.log(`Bucket "${b.id}" : ${fichiers.length} fichier(s)`)
  for (const [i, f] of fichiers.entries()) {
    const { data: blob, error: dl } = await ancien.storage.from(b.id).download(f.chemin)
    if (dl) { echecs++; console.error(`  ✗ ${f.chemin} (téléchargement : ${dl.message})`); continue }
    const { error: up } = await nouveau.storage.from(b.id)
      .upload(f.chemin, blob, { upsert: true, contentType: f.type || blob.type })
    if (up) { echecs++; console.error(`  ✗ ${f.chemin} (envoi : ${up.message})`); continue }
    total++
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${fichiers.length}`)
  }
}
console.log(`Terminé : ${total} fichier(s) copiés, ${echecs} échec(s).`)
process.exit(echecs ? 1 : 0)
