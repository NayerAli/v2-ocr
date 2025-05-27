import * as pdfjsLib from "pdfjs-dist"

let isInitialized = false

export async function initializePDFJS() {
  if (isInitialized) return

  try {
    // For PDF.js 4.x, we have copied the worker file to the public folder
    if (typeof window !== 'undefined') {
      // Set the worker from our local file
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
      
      // The module has changed in PDF.js 4.x (uses ESM format)
      // This approach allows better compatibility between different versions
      console.log(`Using PDF.js version: ${pdfjsLib.version}`);
    }

    // Set basic parameters for PDF.js
    const params = {
      disableRange: false,
      disableStream: false,
      disableAutoFetch: false,
      isEvalSupported: true
    };

    // Store the parameters for later use
    if (typeof window !== 'undefined') {
      // Define a type for the extended window object
      interface ExtendedWindow extends Window {
        pdfJsParams?: typeof params;
      }
      (window as ExtendedWindow).pdfJsParams = params;
    }

    // Test PDF.js initialization with proper error handling
    try {
      // Simple header for a PDF file (used for testing)
      const testPdfData = new Uint8Array([37, 80, 68, 70, 45]);
      
      // Test document loading
      await pdfjsLib.getDocument({
        data: testPdfData,
        ...params,
      }).promise.catch(error => {
        if (error.name === "InvalidPDFException") {
          // This is expected as we passed an invalid PDF
          return;
        }
        throw error;
      });

      isInitialized = true;
      console.log("PDF.js initialized successfully");
    } catch (error) {
      console.warn("PDF.js initialization test failed, but we'll continue anyway:", error);
      // Still mark as initialized to avoid repeated failures
      isInitialized = true;
    }
  } catch (error) {
    console.error("Failed to initialize PDF.js:", error);
    // Don't throw the error, just log it and continue
    // This allows the application to work even if PDF.js fails to initialize
    isInitialized = true;
  }
}

// Initialize on module load
if (typeof window !== "undefined") {
  initializePDFJS().catch(console.error);
}