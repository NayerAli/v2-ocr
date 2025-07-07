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
  // Trim any whitespace then strip the last extension
  return filename.trim().replace(/\.[^./]+$/, '')
}
