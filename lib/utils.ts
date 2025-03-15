import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Map of file extensions to MIME types
const extensionToMimeType: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff'
}

// Map of MIME types to file extensions
const mimeTypeToExtension: Record<string, string> = Object.entries(extensionToMimeType)
  .reduce((acc, [ext, mime]) => ({ ...acc, [mime]: ext }), {})

/**
 * Convert file extension to MIME type
 */
export function extensionToMime(extension: string): string | undefined {
  return extensionToMimeType[extension.toLowerCase()]
}

/**
 * Convert MIME type to file extension
 */
export function mimeToExtension(mimeType: string): string | undefined {
  return mimeTypeToExtension[mimeType.toLowerCase()]
}

/**
 * Check if a file type is allowed based on either MIME type or extension
 */
export function isAllowedFileType(fileType: string, allowedTypes: string[]): boolean {
  // If it's a MIME type
  if (fileType.includes('/')) {
    return allowedTypes.some(type => 
      type.includes('/') 
        ? type.toLowerCase() === fileType.toLowerCase()
        : extensionToMime(type)?.toLowerCase() === fileType.toLowerCase()
    )
  }
  
  // If it's an extension
  return allowedTypes.some(type =>
    type.includes('/')
      ? mimeToExtension(type)?.toLowerCase() === fileType.toLowerCase()
      : type.toLowerCase() === fileType.toLowerCase()
  )
}
