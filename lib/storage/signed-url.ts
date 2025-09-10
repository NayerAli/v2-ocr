import { supabase } from '@/lib/database/utils'
import { getUser } from '@/lib/auth-client'
import { normalizeStoragePath } from './path'

/** TTL par défaut: 3600s (1h). Ajuste si besoin. */
const DEFAULT_TTL = 3600

/** Construit le chemin "bucket/userId/storagePath" attendu par le Storage. */
function buildUserScopedPath(userId: string, storagePath: string) {
  return normalizeStoragePath(userId, storagePath)
}

/** Génère une URL signée pour un seul fichier. */
export async function getSignedUrlFor(
  bucket: string,
  storagePath: string,
  expiresIn: number = DEFAULT_TTL
): Promise<string> {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const path = buildUserScopedPath(user.id, storagePath)
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) throw error ?? new Error('No signedUrl returned')

  return data.signedUrl
}

/** Génère des URLs signées en lot. Retourne un mapping storagePath -> signedUrl. */
export async function getSignedUrlsForBatch(
  bucket: string,
  storagePaths: string[],
  expiresIn: number = DEFAULT_TTL
): Promise<Record<string, string>> {
  if (storagePaths.length === 0) return {}

  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const paths = storagePaths.map((p) => buildUserScopedPath(user.id, p))
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn)
  if (error || !data) throw error ?? new Error('No signedUrls returned')

  // Supabase renvoie les objets dans le même ordre.
  const out: Record<string, string> = {}
  storagePaths.forEach((p, i) => {
    const signed = data[i]?.signedUrl
    if (signed) out[p] = signed
  })
  return out
}
