import * as pdfjsLib from "pdfjs-dist"
import { initializePDFJS } from "./pdf-init"
import type { PDFPageProxy } from "pdfjs-dist"

// Worker initialization is handled in pdf-init.ts

export async function loadPDF(file: File) {
  try {
    // Make sure PDF.js is initialized
    await initializePDFJS()

    // Simple approach that works for all file sizes
    console.log(`Loading PDF: ${file.name} (${Math.round(file.size / 1024)}KB)`)

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer()

    // Get any parameters from initialization
    // Define a type for the extended window object
    interface ExtendedWindow extends Window {
      pdfJsParams?: {
        disableRange?: boolean;
        disableStream?: boolean;
        disableAutoFetch?: boolean;
        isEvalSupported?: boolean;
      };
    }
    const pdfJsParams = typeof window !== 'undefined' ? ((window as ExtendedWindow).pdfJsParams || {}) : {};

    // Load the PDF with optimized parameters for PDF.js 4.x
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      ...pdfJsParams
    }).promise;

    if (pdf.numPages === 0) {
      throw new Error("PDF file contains no pages")
    }

    return pdf
  } catch (error) {
    console.error("Error loading PDF:", error)
    throw error instanceof Error
      ? new Error(`Failed to load PDF: ${error.message}`)
      : new Error("Failed to load PDF file")
  }
}

export async function renderPageToBase64(page: PDFPageProxy) {
  // Higher scale for better quality
  const scale = 1.5

  // Get viewport
  const viewport = page.getViewport({ scale })

  // Prefer OffscreenCanvas when available because it keeps rendering even when
  // the tab is in the background and does not depend on the DOM or display
  // painting. This avoids the throttling applied by browsers to hidden tabs
  // and is the root cause of the "processing stops when the tab is inactive" bug.
  const useOffscreen = typeof OffscreenCanvas !== 'undefined'

  // Dynamically create the canvas
  const canvas: HTMLCanvasElement | OffscreenCanvas = useOffscreen
    ? new OffscreenCanvas(viewport.width, viewport.height)
    // Fallback to a regular canvas for browsers that do not yet support
    // OffscreenCanvas
    : ((): HTMLCanvasElement => {
        const c = document.createElement('canvas')
        c.width = viewport.width
        c.height = viewport.height
        return c
      })()

  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null

  if (!context) {
    throw new Error('Could not get canvas context')
  }

  // Prepare rendering context
  const renderContext = {
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }

  // Render the page – this returns a promise that resolves when rendering is
  // complete, even in background tabs when OffscreenCanvas is used.
  await page.render(renderContext).promise

  // Convert canvas to base64-encoded JPEG. The implementation differs slightly
  // depending on the canvas type in use.
  let base64: string

  if (useOffscreen) {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    base64 = await blobToBase64(blob)
  } else {
    base64 = (canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.8).split(',')[1]
  }

  return base64
}

// Helper: convert a Blob to a base64 string (without the data: prefix)
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'))
    reader.readAsDataURL(blob)
  })
}

export async function createPDFThumbnail(file: File) {
  try {
    // Load the PDF
    const pdf = await loadPDF(file)
    
    // Get the first page
    const page = await pdf.getPage(1)
    
    // Render to base64
    const base64 = await renderPageToBase64(page)
    
    return `data:image/jpeg;base64,${base64}`
  } catch (error) {
    console.error("Error creating PDF thumbnail:", error)
    return ''
  }
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