import * as pdfjsLib from "pdfjs-dist"

let isInitialized = false

// Add polyfill for Promise.withResolvers() if it doesn't exist
// This is needed for PDF.js v4.10.38+ which uses this feature
if (typeof Promise.withResolvers !== 'function') {
  // Define the PromiseWithResolvers type to match the native implementation
  type CustomPromiseWithResolvers<T> = {
    promise: Promise<T>,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void
  };

  // Implement the polyfill with the correct type
  Promise.withResolvers = function<T>(): CustomPromiseWithResolvers<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  console.log("Added polyfill for Promise.withResolvers()");
}

export async function initializePDFJS() {
  if (isInitialized) return

  try {
    // Check for PDF.js version
    let pdfJsVersion = "unknown";
    if (typeof pdfjsLib.version === 'string') {
      pdfJsVersion = pdfjsLib.version;
    } else if (typeof pdfjsLib.version === 'object' && pdfjsLib.version.toString) {
      pdfJsVersion = pdfjsLib.version.toString();
    }
    console.log(`Initializing PDF.js version ${pdfJsVersion}`);

    // Configure PDF.js based on environment
    if (typeof window !== 'undefined') {
      // Browser environment - use web worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";

      // Set browser-optimized parameters
      const params = {
        disableRange: false,
        disableStream: false,
        disableAutoFetch: false,
        isEvalSupported: true,
        // Enable standard fonts
        standardFontDataUrl: '/pdfjs/standard_fonts/'
      };

      // Store the parameters for later use
      // Define a type for the extended window object
      interface ExtendedWindow extends Window {
        pdfJsParams?: typeof params;
      }
      (window as ExtendedWindow).pdfJsParams = params;

      // Test PDF.js initialization in browser
      try {
        await pdfjsLib.getDocument(new Uint8Array([37, 80, 68, 70, 45])).promise
          .catch(error => {
            if (error.name === "InvalidPDFException") {
              // This is expected as we passed an invalid PDF
              return
            }
            throw error
          })
        console.log("PDF.js initialized successfully in browser environment");
      } catch (error) {
        console.warn("PDF.js browser initialization test failed, but we'll continue anyway:", error);
      }
    } else {
      // Server environment - disable worker
      console.log("Server environment detected, configuring PDF.js for server-side rendering");

      // Use the legacy build for Node.js environments
      console.log("Using legacy build for Node.js environment");
      try {
        // Dynamically require the legacy build
        // For version 2.16.105, the legacy build is in a different location
        const pdfjsLegacy = require('pdfjs-dist/legacy/build/pdf');
        global.pdfjsLib = pdfjsLegacy;
        console.log("Legacy build loaded successfully");
      } catch (error) {
        console.error("Failed to load legacy build:", error);
        // Try alternative paths for different versions
        try {
          const pdfjsLegacy = require('pdfjs-dist/build/pdf.js');
          global.pdfjsLib = pdfjsLegacy;
          console.log("Alternative legacy build loaded successfully");
        } catch (altError) {
          console.error("Failed to load alternative legacy build:", altError);
          // Continue with the standard build if all legacy attempts fail
        }
      }

      // Explicitly disable worker in server environment
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';

      // Configure server-side settings
      // We don't need to validate the API here since we handle API differences in the pdf-utils-server.ts

      // No need to test in server environment as it will be handled by pdf-utils-server.ts
    }

    isInitialized = true
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