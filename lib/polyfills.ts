// Polyfills and safe shims for browser/runtime gaps
// Currently: crypto.randomUUID fallback for older browsers/environments
/* eslint-disable @typescript-eslint/no-explicit-any */

// Lightweight RFC4122 v4 generator using crypto.getRandomValues when available
function uuidV4(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis !== 'undefined') {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
      }
    } catch {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    }
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  }

  // Per RFC 4122 §4.4 set version and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Install polyfill if missing
(() => {
  try {
    if (typeof globalThis !== 'undefined') {
      const gCrypto: any = (globalThis as any).crypto;
      if (!gCrypto || typeof gCrypto.randomUUID !== 'function') {
        const randomUUID = uuidV4;
        const nextCrypto = { ...(gCrypto || {}), randomUUID } as any;
        (globalThis as any).crypto = nextCrypto;
      }
    }
  } catch {
    // Silently ignore — best-effort polyfill for environments that disallow mutation
  }
})();

export {};
