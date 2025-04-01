import * as pdfjsLib from "pdfjs-dist"
import "pdfjs-dist/build/pdf.worker.mjs"

let isInitialized = false

export async function initializePDFJS() {
  if (isInitialized) return

  try {
    // Don't set GlobalWorkerOptions.workerSrc as the worker is imported directly
    
    // Test initialization
    await pdfjsLib.getDocument(new Uint8Array([37, 80, 68, 70, 45])).promise
      .catch(error => {
        if (error.name === "InvalidPDFException") {
          // This is expected as we passed an invalid PDF
          return
        }
        throw error
      });

    isInitialized = true
    console.log("PDF.js initialized successfully")
  } catch (error) {
    console.error("Failed to initialize PDF.js:", error)
    throw error
  }
}

// Initialize on module load, but only in browser
if (typeof window !== "undefined") {
  initializePDFJS().catch(console.error)
} 