export function normalizeStoragePath(userId: string, path: string): string {
  if (!path) return path;
  const prefix = `${userId}/`;
  let normalized = path;
  while (normalized.startsWith(prefix)) {
    normalized = normalized.slice(prefix.length);
  }
  return `${prefix}${normalized}`;
}
