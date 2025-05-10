import * as pdfjsLib from "pdfjs-dist"
import { initializePDFJS } from "./pdf-init"
import type { PDFPageProxy } from "pdfjs-dist"

// Worker initialization is handled in pdf-init.ts

/**
 * Load a PDF file and return a PDF document proxy
 * This function handles both client and server environments
 */
export async function loadPDF(file: File) {
  try {
    // Make sure PDF.js is initialized with polyfills
    await initializePDFJS()

    // Simple approach that works for all file sizes
    console.log(`Loading PDF: ${file.name} (${Math.round(file.size / 1024)}KB)`)

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer()

    // Determine if we're in a browser or server environment
    const isServer = typeof window === 'undefined';

    // Configure parameters based on environment
    let pdfParams: any = {};

    if (isServer) {
      // Server-side parameters (no worker)
      pdfParams = {
        data: arrayBuffer,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true,
        isEvalSupported: false,
        disableWorker: true // Critical for server environment
      };
    } else {
      // Browser parameters (with worker)
      // Get any parameters from initialization
      interface ExtendedWindow extends Window {
        pdfJsParams?: {
          disableRange?: boolean;
          disableStream?: boolean;
          disableAutoFetch?: boolean;
          isEvalSupported?: boolean;
        };
      }
      const pdfJsParams = (window as ExtendedWindow).pdfJsParams || {};

      pdfParams = {
        data: arrayBuffer,
        ...pdfJsParams
      };
    }

    // Load the PDF with environment-specific parameters
    const pdf = await pdfjsLib.getDocument(pdfParams).promise;

    if (pdf.numPages === 0) {
      throw new Error("PDF file contains no pages")
    }

    return pdf
  } catch (error) {
    console.error("Error loading PDF:", error)
    // Provide more detailed error information
    if (error instanceof Error) {
      // Check for specific Promise.withResolvers error
      if (error.message.includes('Promise.withResolvers is not a function')) {
        throw new Error(`PDF.js compatibility error: Promise.withResolvers is not available. Please check PDF.js initialization.`)
      }
      // Check for worker-related errors
      if (error.message.includes('worker') || error.message.includes('Worker')) {
        throw new Error(`PDF.js worker error: ${error.message}. Try using disableWorker: true.`)
      }
      throw new Error(`Failed to load PDF: ${error.message}`)
    } else {
      throw new Error("Failed to load PDF file")
    }
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