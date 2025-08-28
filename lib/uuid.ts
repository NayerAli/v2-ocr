// UUID utilities
// Provides getUUID() that prefers crypto.randomUUID with a safe fallback.

// Lightweight RFC4122 v4 generator using crypto.getRandomValues when available
function uuidV4Fallback(): string {
  const bytes = new Uint8Array(16)
  try {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0
    }
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40 // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getUUID(): string {
  try {
    const rnd = globalThis?.crypto?.randomUUID?.()
    return rnd || uuidV4Fallback()
  } catch {
    return uuidV4Fallback()
  }
}

