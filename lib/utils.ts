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
 * Remove the extension from a filename and sanitize it for downloads.
 * Example: "file.pdf" -> "file", "file.tar.gz" -> "file_tar_gz"
 */
export function removeFileExtension(filename: string): string {
  // Trim any whitespace
  const trimmed = filename.trim()
  
  // If the filename is empty after trimming, return a timestamped export name
  if (!trimmed) {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    return `Export_${day}-${month}-${year}`
  }
  
  // Replace all dots with underscores to avoid multiple extension issues
  return trimmed.replace(/\./g, '_')
}
