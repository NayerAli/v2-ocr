// PDF processing is now handled entirely server-side
// This file is kept for backward compatibility but PDF functions are deprecated

console.warn("PDF processing functions are deprecated. All PDF processing is now handled server-side.")

// Deprecated: PDF processing is now server-side only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function loadPDF(_file: File) {
  console.warn("loadPDF is deprecated. PDF processing is now handled server-side.")
  throw new Error("PDF processing is now handled server-side. Please upload the PDF directly.")
}

// Deprecated: PDF processing is now server-side only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function renderPageToBase64(_page: unknown) {
  console.warn("renderPageToBase64 is deprecated. PDF processing is now handled server-side.")
  throw new Error("PDF processing is now handled server-side.")
}

// Deprecated: PDF processing is now server-side only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createPDFThumbnail(_file: File) {
  console.warn("createPDFThumbnail is deprecated. PDF processing is now handled server-side.")
  // Return a generic PDF placeholder
  return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik02MCA2MEgxNDBWMTQwSDYwVjYwWiIgZmlsbD0iI0VGNDQ0NCIvPgo8dGV4dCB4PSIxMDAiIHk9IjEwNSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UERGPC90ZXh0Pgo8L3N2Zz4K"
}

export async function createImageThumbnail(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Create a small canvas
      const canvas = document.createElement('canvas')
      const MAX_WIDTH = 100
      const MAX_HEIGHT = 100
      
      // Calculate dimensions
      let width = img.width
      let height = img.height
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width
          width = MAX_WIDTH
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height
          height = MAX_HEIGHT
        }
      }
      
      canvas.width = width
      canvas.height = height
      
      // Draw image
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error("Could not get canvas context"))
        return
      }
      
      ctx.drawImage(img, 0, 0, width, height)
      
      // Get base64
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    
    img.onerror = () => {
      reject(new Error("Failed to load image"))
    }
    
    img.src = URL.createObjectURL(file)
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}