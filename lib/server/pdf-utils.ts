import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { RenderParameters } from 'pdfjs-dist/types/src/display/api';
import { getDocument } from 'pdfjs-dist';
import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';
import { initializePDFJS } from './pdf-init';

// Constants for optimal rendering
const OPTIMAL_DPI = 300;
const PAGE_TIMEOUT = 30000; // 30 seconds timeout

// Initialize PDF.js configuration
let pdfConfig: Awaited<ReturnType<typeof initializePDFJS>> | undefined;

/**
 * Ensure PDF.js is initialized
 */
async function ensurePDFJSInit() {
  console.log('[PDF.js] Ensuring initialization...');
  
  // Check if we're in the correct environment
  if (typeof process === 'undefined') {
    throw new Error('PDF.js initialization failed: Not in Node.js environment');
  }
  
  if (!pdfConfig) {
    console.log('[PDF.js] No config found, initializing...');
    pdfConfig = await initializePDFJS();
    console.log('[PDF.js] Config loaded:', pdfConfig);
  }
  return pdfConfig;
}

/**
 * Load a PDF from a buffer with proper error handling and cleanup
 */
export async function loadPDFFromBuffer(buffer: Buffer): Promise<PDFDocumentProxy> {
  try {
    console.log('[PDF.js] Starting to load PDF...');
    console.log('[PDF.js] Buffer size:', buffer.length, 'bytes');

    if (buffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Ensure PDF.js is initialized
    console.log('[PDF.js] Getting configuration...');
    const config = await ensurePDFJSInit();
    console.log('[PDF.js] Using config:', config);
    
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);
    console.log('[PDF.js] Converted buffer to Uint8Array');
    
    // Create loading task with options
    console.log('[PDF.js] Creating document loading task...');
    const loadingTask = getDocument({
      data: uint8Array,
      ...config,
      useSystemFonts: true,
      verbosity: 1 // Increase verbosity for debugging
    });
    
    // Race the loading task against the timeout
    console.log('[PDF.js] Starting document load with timeout...');
    const pdf = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PDF loading timeout')), PAGE_TIMEOUT);
      })
    ]) as PDFDocumentProxy;
    
    if (!pdf || pdf.numPages === 0) {
      throw new Error('PDF file contains no pages');
    }
    
    console.log('[PDF.js] Successfully loaded PDF with', pdf.numPages, 'pages');
    
    // Clear buffer after successful loading
    buffer.fill(0);
    uint8Array.fill(0);
    
    return pdf;
  } catch (error) {
    console.error('[PDF.js] Error loading PDF:', error);
    if (error instanceof Error) {
      console.error('[PDF.js] Error stack:', error.stack);
      // Check for specific worker-related errors
      if (error.message.includes('worker') || error.message.includes('WorkerMessageHandler')) {
        console.error('[PDF.js] Worker-related error detected. Worker state:', {
          workerSrc: (globalThis as any).pdfjsWorker?.WorkerMessageHandler ? 'Present' : 'Missing',
          nodeVersion: process.version,
          arch: process.arch,
          platform: process.platform
        });
      }
    }
    throw error instanceof Error 
      ? new Error(`Failed to load PDF: ${error.message}`)
      : new Error('Failed to load PDF file');
  }
}

/**
 * Render a PDF page to a buffer with proper error handling and cleanup
 */
export async function renderPageToBuffer(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale = OPTIMAL_DPI / 72 // Convert from PDF points to pixels
): Promise<Buffer> {
  let page: PDFPageProxy | null = null;
  let canvas: Canvas | null = null;
  
  try {
    console.log(`[PDF.js] Starting to render page ${pageNumber}...`);
    
    // Get the page
    console.log(`[PDF.js] Getting page ${pageNumber}...`);
    page = await pdf.getPage(pageNumber);
    
    // Calculate viewport dimensions
    const viewport = page.getViewport({ scale });
    console.log(`[PDF.js] Viewport dimensions: ${viewport.width}x${viewport.height}`);
    
    // Create canvas with the right dimensions
    canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    console.log(`[PDF.js] Created canvas with dimensions: ${canvas.width}x${canvas.height}`);
    
    // Prepare render context
    const renderContext: RenderParameters = {
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      enableWebGL: false,
      renderInteractiveForms: false
    };
    
    // Render the page
    console.log(`[PDF.js] Starting page render...`);
    await page.render(renderContext).promise;
    console.log(`[PDF.js] Page render complete`);
    
    // Convert to buffer with high quality
    const buffer = canvas.toBuffer('image/png', {
      compressionLevel: 6,
      filters: canvas.PNG_FILTER_NONE,
      resolution: 144
    });
    console.log(`[PDF.js] Converted to PNG buffer, size: ${buffer.length} bytes`);
    
    // Cleanup
    await page.cleanup();
    page = null;
    canvas = null;
    
    return buffer;
  } catch (error) {
    // Ensure cleanup on error
    if (page) await page.cleanup();
    page = null;
    canvas = null;
    
    console.error(`[PDF.js] Error rendering page ${pageNumber}:`, error);
    if (error instanceof Error) {
      console.error('[PDF.js] Error stack:', error.stack);
    }
    throw error instanceof Error
      ? new Error(`Failed to render PDF page ${pageNumber}: ${error.message}`)
      : new Error(`Failed to render PDF page ${pageNumber}`);
  }
}

/**
 * Render a PDF page to base64
 */
export async function renderPageToBase64(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<string> {
  try {
    console.log(`[PDF.js] Converting page ${pageNumber} to base64...`);
    const buffer = await renderPageToBuffer(pdf, pageNumber);
    const base64 = buffer.toString('base64');
    buffer.fill(0);
    console.log(`[PDF.js] Successfully converted page ${pageNumber} to base64`);
    return base64;
  } catch (error) {
    console.error(`[PDF.js] Error converting page ${pageNumber} to base64:`, error);
    if (error instanceof Error) {
      console.error('[PDF.js] Error stack:', error.stack);
    }
    throw error instanceof Error 
      ? new Error(`Failed to render PDF page to base64: ${error.message}`)
      : new Error('Failed to render PDF page to base64');
  }
}