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

    // Load the PDF with optimized parameters
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

export async function renderPageToBase64(page: PDFPageProxy): Promise<string> {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true
  })
  if (!context) throw new Error("Could not get canvas context")

  try {
    // Use a simpler approach with reasonable defaults
    // Standard 150 DPI is good enough for OCR and avoids memory issues
    const scale = 150 / 72 // Convert from PDF points to pixels
    const viewport = page.getViewport({ scale })

    // Set canvas dimensions
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)

    // Clear canvas with white background
    context.fillStyle = "white"
    context.fillRect(0, 0, canvas.width, canvas.height)

    // Render the page
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise

    // Use JPEG for better compression
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8)

    // Extract base64 data
    const base64Data = dataUrl.split(",")[1]

    return base64Data
  } catch (error) {
    console.error("Error rendering PDF page:", error)
    throw new Error("Failed to render PDF page")
  } finally {
    // Clean up resources
    canvas.width = 0
    canvas.height = 0
  }
}