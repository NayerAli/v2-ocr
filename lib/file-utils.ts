import { CONFIG } from "@/config/constants"

export async function generatePreview(file: File): Promise<string> {
  if (file.size > CONFIG.PREVIEW_MAX_SIZE) {
    // For large files, create a thumbnail
    if (file.type.startsWith("image/")) {
      return createImageThumbnail(file)
    }
    if (file.type === "application/pdf") {
      // For PDFs, return a generic PDF icon or placeholder
      // PDF processing is now handled entirely server-side
      return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik02MCA2MEgxNDBWMTQwSDYwVjYwWiIgZmlsbD0iI0VGNDQ0NCIvPgo8dGV4dCB4PSIxMDAiIHk9IjEwNSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UERGPC90ZXh0Pgo8L3N2Zz4K"
    }
  }

  // For small files, return data URL directly
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function createImageThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas context")

  // Calculate thumbnail dimensions
  const maxDim = 200
  const ratio = Math.min(maxDim / bitmap.width, maxDim / bitmap.height)
  canvas.width = bitmap.width * ratio
  canvas.height = bitmap.height * ratio

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.7)
}

export async function* processLargeFile(file: File) {
  // PDF processing is now handled entirely server-side
  // This function is kept for backward compatibility but PDFs are no longer processed here
  if (file.type === "application/pdf") {
    console.log("PDF processing is now handled server-side. This function should not be called for PDFs.")
    throw new Error("PDF processing is handled server-side. Upload the PDF directly.")
  } else if (file.type.startsWith("image/")) {
    // For images, process directly
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        resolve(base64.split(",")[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    yield [
      {
        pageNumber: 1,
        base64,
      },
    ]
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function estimateProcessingTime(file: File): number {
  // Rough estimation based on file type and size
  const baseTime = 2000 // Base processing time in ms
  const sizeMultiplier = file.size / (1024 * 1024) // Size in MB

  if (file.type === "application/pdf") {
    // Assume 2 seconds per page, rough estimate from file size
    const estimatedPages = Math.ceil(sizeMultiplier * 10) // Rough estimate: 10 pages per MB
    return baseTime + estimatedPages * 2000
  }

  // For images, base it on file size
  return baseTime + sizeMultiplier * 1000
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

