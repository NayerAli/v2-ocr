import * as pdfjsLib from "pdfjs-dist"
import { initializePDFJS } from "./pdf-init"

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export async function initPDFJS() {
  const { getDocument } = await import("pdfjs-dist")
  return { getDocument }
}

export async function loadPDF(file: File) {
  try {
    await initializePDFJS()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    // Verify the PDF is valid by checking page count
    const numPages = pdf.numPages
    if (numPages === 0) {
      throw new Error("PDF file contains no pages")
    }
    
    return pdf
  } catch (error) {
    console.error("Error loading PDF:", error)
    if (error instanceof Error) {
      if (error.message.includes("Invalid PDF structure")) {
        throw new Error("The PDF file appears to be corrupted or invalid")
      }
      throw new Error(`Failed to load PDF: ${error.message}`)
    }
    throw new Error("Failed to load PDF file")
  }
}

export async function renderPageToBase64(page: any): Promise<string> {
  const canvas = document.createElement("canvas")
  // Use alpha channel for better quality
  const context = canvas.getContext("2d", { 
    alpha: true,
    willReadFrequently: true, // Optimize for pixel reading
  })
  if (!context) throw new Error("Could not get canvas context")

  try {
    const viewport = page.getViewport({ scale: 1.0 })
    
    // Calculate optimal scale for OCR (minimum 300 DPI)
    const OPTIMAL_DPI = 300
    const scale = Math.max(1.0, OPTIMAL_DPI / 72) // PDF default DPI is 72
    
    const scaledViewport = page.getViewport({ scale })
    canvas.width = Math.floor(scaledViewport.width)
    canvas.height = Math.floor(scaledViewport.height)

    // Clear canvas with white background
    context.fillStyle = "white"
    context.fillRect(0, 0, canvas.width, canvas.height)

    const renderContext = {
      canvasContext: context,
      viewport: scaledViewport,
      // Enable image smoothing for better quality
      imageSmoothing: true,
      imageQuality: "high",
    }

    await page.render(renderContext).promise

    // Use PNG format with no compression for best quality
    const imageData = canvas.toDataURL("image/png", 1.0)
    return imageData.split(",")[1]
  } catch (error) {
    console.error("Error rendering PDF page:", error)
    throw new Error("Failed to render PDF page. The page might be corrupted or contain unsupported features.")
  } finally {
    // Clean up
    canvas.width = 0
    canvas.height = 0
  }
} 