import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Determines if a file is an image based on its type or filename
 * @param fileType The MIME type of the file
 * @param filename The filename of the file
 * @returns True if the file is an image, false otherwise
 */
export function isImageFile(fileType?: string, filename?: string): boolean {
  if (fileType?.startsWith('image/')) {
    return true
  }

  if (filename) {
    const lowerFilename = filename.toLowerCase()
    return [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'
    ].some(ext => lowerFilename.endsWith(ext))
  }

  return false
}

export function getSafeDownloadName(filename?: string): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const fallback = `Export_${day}-${month}-${year}`
  if (!filename?.trim()) return fallback;

  let sanitized = filename
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return fallback;

  sanitized = sanitized.replace(/[/\\]/g, "_");

  const lastDotIndex = sanitized.lastIndexOf(".");
  const lastSlashIndex = Math.max(
    sanitized.lastIndexOf("/"),
    sanitized.lastIndexOf("\\")
  );

  if (lastDotIndex === 0 && lastSlashIndex === -1) {
    return sanitized;
  }

  let baseName;
  if (lastDotIndex > lastSlashIndex && lastDotIndex > 0) {
    const base = sanitized.substring(0, lastDotIndex);
    baseName = base.replace(/\./g, "_");
  } else {
    baseName = sanitized;
  }

  const maxLength = 255 - 4;
  if (baseName.length > maxLength) {
    baseName = baseName.substring(0, maxLength);
  }

  return baseName;
}
