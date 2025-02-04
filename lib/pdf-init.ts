import * as pdfjsLib from "pdfjs-dist"

let isInitialized = false

export async function initializePDFJS() {
  if (isInitialized) return

  try {
    // Use webpack worker loader for better reliability
    const worker = new Worker(new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url))
    pdfjsLib.GlobalWorkerOptions.workerPort = worker

    // Test PDF.js initialization with proper error handling
    await pdfjsLib.getDocument(new Uint8Array([37, 80, 68, 70, 45])).promise
      .catch(error => {
        if (error.name === "InvalidPDFException") {
          // This is expected as we passed an invalid PDF
          return
        }
        throw error
      })

    isInitialized = true
    console.log("PDF.js initialized successfully")
  } catch (error) {
    console.error("Failed to initialize PDF.js:", error)
    throw error
  }
}

// Initialize on module load
if (typeof window !== "undefined") {
  initializePDFJS().catch(console.error)
} 