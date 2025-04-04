import * as pdfjsLib from "pdfjs-dist"

let isInitialized = false

export async function initializePDFJS() {
  if (isInitialized) return

  try {
    // Simple approach that works with Next.js
    // Set the worker directly from the version
    /*if (typeof window !== 'undefined') {
      // Only set worker in browser environment
      // Try multiple CDNs for better reliability
      const cdnUrls = [
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`,
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`,
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
      ];

      // Use the first CDN by default
      pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrls[0];

      // Add a fallback mechanism
      window.addEventListener('error', function(e) {
        // If the error is related to loading the PDF worker
        if (e.filename && e.filename.includes('pdf.worker.min.js')) {
          console.warn('Failed to load PDF worker from primary CDN, trying fallbacks...');
          // Try the next CDN
          const currentIndex = cdnUrls.findIndex(url => e.filename.includes(url));
          if (currentIndex >= 0 && currentIndex < cdnUrls.length - 1) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrls[currentIndex + 1];
            console.log(`Trying alternative CDN: ${cdnUrls[currentIndex + 1]}`);
          }
        }
      }, true);
    }*/
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";

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
      console.warn("PDF.js initialization test failed, but we'll continue anyway:", error)
      // Still mark as initialized to avoid repeated failures
      isInitialized = true
    }
  } catch (error) {
    console.error("Failed to initialize PDF.js:", error)
    // Don't throw the error, just log it and continue
    // This allows the application to work even if PDF.js fails to initialize
    isInitialized = true
  }
}

// Initialize on module load
if (typeof window !== "undefined") {
  initializePDFJS().catch(console.error)
}