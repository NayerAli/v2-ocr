import { CONFIG } from "@/config/constants"

export async function generatePreview(file: File): Promise<string> {
  if (file.size > CONFIG.PREVIEW_MAX_SIZE) {
    // For large files, create a thumbnail
    if (file.type.startsWith("image/")) {
      return createImageThumbnail(file)
    }
    if (file.type === "application/pdf") {
      return createPDFThumbnail(file)
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

async function createPDFThumbnail(file: File): Promise<string> {
  const { getDocument } = await import("pdfjs-dist")
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)

  const viewport = page.getViewport({ scale: 1.0 })
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas context")

  // Calculate thumbnail dimensions
  const maxDim = 200
  const ratio = Math.min(maxDim / viewport.width, maxDim / viewport.height)
  canvas.width = viewport.width * ratio
  canvas.height = viewport.height * ratio

  const scaledViewport = page.getViewport({ scale: ratio })
  await page.render({
    canvasContext: ctx,
    viewport: scaledViewport,
  }).promise

  return canvas.toDataURL("image/jpeg", 0.7)
}

export async function* processLargeFile(file: File) {
  if (file.type === "application/pdf") {
    const { getDocument } = await import("pdfjs-dist")
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await getDocument({ data: arrayBuffer }).promise

    // Process PDF in chunks
    for (let i = 1; i <= pdf.numPages; i += CONFIG.CHUNK_SIZE) {
      const chunk = []
      for (let j = i; j < Math.min(i + CONFIG.CHUNK_SIZE, pdf.numPages + 1); j++) {
        const page = await pdf.getPage(j)
        const viewport = page.getViewport({ scale: 1.0 })
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Could not get canvas context")

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise

        chunk.push({
          pageNumber: j,
          base64: canvas.toDataURL("image/png").split(",")[1],
        })
      }
      yield chunk
    }
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

export function formatFileSize(bytes: number | undefined): string {
  if (typeof bytes !== "number" || isNaN(bytes)) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
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

