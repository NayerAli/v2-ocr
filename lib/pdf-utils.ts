import * as pdfjsLib from "pdfjs-dist"
import { initializePDFJS } from "./pdf-init"
import type { PDFPageProxy } from "pdfjs-dist"

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export async function loadPDF(file: File) {
  try {
    await initializePDFJS()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
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

export async function renderPageToBase64(page: PDFPageProxy): Promise<string> {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { 
    alpha: true,
    willReadFrequently: true
  })
  if (!context) throw new Error("Could not get canvas context")

  try {
    // Calculate optimal scale for OCR (minimum 300 DPI)
    const OPTIMAL_DPI = 300
    const scale = OPTIMAL_DPI / 72 // Convert from PDF points to pixels
    const scaledViewport = page.getViewport({ scale })
    
    canvas.width = Math.floor(scaledViewport.width)
    canvas.height = Math.floor(scaledViewport.height)

    // Clear canvas with white background
    context.fillStyle = "white"
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise

    return canvas.toDataURL("image/png", 1.0).split(",")[1]
  } catch (error) {
    console.error("Error rendering PDF page:", error)
    throw new Error("Failed to render PDF page")
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
} 