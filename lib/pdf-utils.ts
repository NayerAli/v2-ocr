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
  
  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  
  // Get canvas context
  const context = canvas.getContext('2d')
  
  if (!context) {
    throw new Error("Could not get canvas context")
  }
  
  // Prepare rendering context
  const renderContext = {
    canvasContext: context,
    viewport
  }
  
  // Render the page
  await page.render(renderContext).promise
  
  // Get base64
  try {
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    return base64
  } catch (error) {
    console.error("Error converting canvas to base64:", error)
    throw error
  }
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