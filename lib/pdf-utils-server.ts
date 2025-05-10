// Server-side PDF processing utilities
import * as pdfjsLib from "pdfjs-dist";
import { initializePDFJS } from "./pdf-init";
import { createCanvas } from 'canvas';

// Ensure Promise.withResolvers polyfill is available
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
}

// Disable worker for server-side processing
// This is critical for Next.js server components
if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

/**
 * Load a PDF from a buffer on the server
 * This function should only be called from server components or API routes
 */
export async function loadPDFServer(buffer: Buffer) {
  try {
    console.log(`Loading PDF on server (${Math.round(buffer.byteLength / 1024)}KB)`);

    // Initialize PDF.js for server-side
    await initializePDFJS();

    // Make sure we have the global pdfjsLib object
    if (!global.pdfjsLib) {
      console.error('PDF.js not properly initialized for server environment');
      throw new Error('PDF.js not properly initialized');
    }

    // Use the legacy build for Node.js environments with worker disabled
    const pdfOptions = {
      data: buffer,
      // Server-safe parameters
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      isEvalSupported: false,
      // Disable worker to prevent errors in server environment
      disableWorker: true,
      // Enable standard fonts to improve text extraction
      standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
      verbosity: 0, // Reduce console noise
    };

    const pdf = await pdfjsLib.getDocument(pdfOptions).promise;

    console.log(`Successfully loaded PDF with ${pdf.numPages} pages on server`);

    return pdf;
  } catch (error) {
    console.error("Error loading PDF on server:", error);
    // Provide more detailed error information
    if (error instanceof Error) {
      // Check for specific Promise.withResolvers error
      if (error.message.includes('Promise.withResolvers is not a function')) {
        throw new Error(`PDF.js compatibility error on server: Promise.withResolvers is not available.`)
      }
      // Check for worker-related errors
      if (error.message.includes('worker') || error.message.includes('Worker')) {
        throw new Error(`PDF.js worker error on server: ${error.message}. Try using disableWorker: true.`)
      }
      throw new Error(`Failed to load PDF on server: ${error.message}`)
    } else {
      throw new Error("Failed to load PDF file on server");
    }
  }
}

/**
 * Render a PDF page to a base64 string on the server
 * This function should only be called from server components or API routes
 */
export async function renderPageToBase64Server(page: any, scale: number = 2.0): Promise<string> {
  try {
    console.log("Server-side PDF page rendering requested");

    // Use a higher DPI for better OCR results (300 DPI is standard for OCR)
    // PDF.js uses 72 DPI as the base, so 300/72 = 4.167
    const dpiScale = 300 / 72; // 300 DPI is optimal for OCR
    const enhancedScale = scale * dpiScale;

    // Get the viewport with the enhanced scale
    const viewport = page.getViewport({ scale: enhancedScale });

    // Log the dimensions for debugging
    console.log(`[PDF] Rendering at ${Math.round(enhancedScale * 72)} DPI (scale: ${enhancedScale.toFixed(2)})`);
    console.log(`[PDF] Canvas dimensions: ${viewport.width}x${viewport.height} pixels`);

    // Create a canvas with the correct dimensions
    // Use ceiling to ensure we don't cut off any pixels
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    // Set white background (important for OCR)
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    // Render the PDF page to the canvas with optimal settings for OCR
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      // Add additional options for better rendering
      transform: [1, 0, 0, 1, 0, 0], // Identity transform
      background: 'white',
      intent: 'print', // 'print' gives better text quality for OCR
    };

    // Handle rendering with better error handling
    try {
      // Check for older or newer render API
      if (typeof page.render === 'function') {
        // Older API - returns an object with a promise property
        let renderTask = page.render(renderContext);
        if (renderTask && renderTask.promise) {
          await renderTask.promise;
          console.log("[PDF] Page rendered successfully with promise API");
        } else {
          await renderTask;
          console.log("[PDF] Page rendered successfully with direct API");
        }
      } else if (typeof page.render === 'object' && page.render.promise) {
        // Newer API - already returns a promise
        await page.render.promise;
        console.log("[PDF] Page rendered successfully with object.promise API");
      } else {
        console.log("[PDF] Render method type:", typeof page.render);
        // Try a more generic approach as a last resort
        const renderMethod = page.render || (page as any).render;
        if (renderMethod) {
          const result = renderMethod.call(page, renderContext);
          if (result && result.promise) {
            await result.promise;
            console.log("[PDF] Page rendered successfully with fallback method");
          } else if (result && typeof result.then === 'function') {
            await result;
            console.log("[PDF] Page rendered successfully with promise-like fallback");
          } else {
            console.log("[PDF] Render method called but no promise returned");
          }
        } else {
          throw new Error('PDF.js render method not available');
        }
      }
    } catch (renderError) {
      console.error("[PDF] Error during rendering:", renderError);
      // Continue with what we have - the white background will still be there
      console.log("[PDF] Continuing with partial rendering");
    }

    // Use PNG format for highest quality (no compression artifacts)
    // JPEG compression can introduce artifacts that affect OCR quality
    // PNG is lossless and better for text recognition
    const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];

    // Calculate file size for logging (approximate)
    const fileSizeKB = Math.round(base64.length * 0.75 / 1024);

    console.log(`Server-side PDF page rendered successfully: ${width}x${height} pixels, ~${fileSizeKB}KB (scale: ${enhancedScale.toFixed(2)})`);

    return base64;
  } catch (error) {
    console.error("Error rendering PDF page on server:", error);

    // Return a placeholder image if rendering fails, but with a more visible error message
    // This is a 100x100 red image with text "PDF Rendering Error"
    console.log("Rendering failed, returning error image");

    try {
      // Create a canvas with an error message
      const canvas = createCanvas(400, 200);
      const ctx = canvas.getContext('2d');

      // Fill with light red background
      ctx.fillStyle = '#ffdddd';
      ctx.fillRect(0, 0, 400, 200);

      // Add error text
      ctx.fillStyle = '#990000';
      ctx.font = '16px Arial';
      ctx.fillText('PDF Rendering Error', 20, 50);
      ctx.fillText(`Error: ${error instanceof Error ? error.message : String(error)}`, 20, 80);
      ctx.fillText('Please try again or use a different file', 20, 110);

      // Convert to base64 - use PNG for consistency with successful renders
      return canvas.toDataURL('image/png', 1.0).split(',')[1];
    } catch (canvasError) {
      console.error("Error creating error image:", canvasError);
      // Fallback to a simple 1x1 transparent PNG if even the error image fails
      return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    }
  }
}
