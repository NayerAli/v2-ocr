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

/**
 * Remove the extension from a filename.
 * Example: "file.pdf" -> "file"
 */
export function removeFileExtension(filename: string): string {
  // Trim any whitespace
  const trimmed = filename.trim()
  
  // If the filename is empty after trimming, return a default name
  if (!trimmed) {
    return 'document'
  }
  
  // If the filename starts with a dot and has no other dots (e.g., ".pdf", ".txt"),
  // it's a dot-file and we should keep the entire name as the base
  if (trimmed.startsWith('.') && trimmed.indexOf('.', 1) === -1) {
    return trimmed
  }
  
  // Otherwise, remove the last extension (including trailing dots)
  const result = trimmed.replace(/\.[^./]*$/, '')
  
  // If removing the extension results in an empty string, return the original
  return result || trimmed
}
