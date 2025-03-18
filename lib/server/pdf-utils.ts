import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { RenderParameters } from 'pdfjs-dist/types/src/display/api';
import { getDocument } from 'pdfjs-dist';
import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';
import { initializePDFJS } from './pdf-init';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Constants for optimal rendering
const OPTIMAL_DPI = 300;
const PAGE_TIMEOUT = 300000; // 5 minutes timeout
const RENDER_SCALE = 2.0; // Higher scale for better OCR results

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
 * A simpler and more reliable approach to load a PDF and extract pages as base64 images
 */
export async function extractPagesAsBase64(buffer: Buffer): Promise<{pages: string[], numPages: number}> {
  console.log('[PDF.js] Starting PDF extraction using alternative method');
  
  try {
    // Create a temporary directory
    const tempDir = path.join(os.tmpdir(), 'pdf-extract-' + uuidv4());
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[PDF.js] Created temp directory: ${tempDir}`);
    
    // Write the PDF to a temporary file
    const pdfPath = path.join(tempDir, 'input.pdf');
    fs.writeFileSync(pdfPath, buffer);
    console.log(`[PDF.js] Wrote PDF to temporary file: ${pdfPath}`);
    
    // Use pdftoppm to convert PDF to images (this is much more reliable than PDF.js in headless environments)
    const pages: string[] = [];
    
    try {
      console.log('[PDF.js] Using pdftoppm for PDF conversion');
      
      // Check if pdftoppm is available
      if (await isPdftoppmAvailable()) {
        console.log('[PDF.js] pdftoppm is available, using it for PDF conversion');
        const pageImages = await convertPdfToPng(pdfPath, tempDir);
        
        // Convert the images to base64
        for (const imagePath of pageImages) {
          const imageBuffer = fs.readFileSync(imagePath);
          const base64 = imageBuffer.toString('base64');
          pages.push(base64);
          
          // Clean up the image file
          fs.unlinkSync(imagePath);
        }
        
        console.log(`[PDF.js] Successfully extracted ${pages.length} pages using pdftoppm`);
      } else {
        console.log('[PDF.js] pdftoppm not available, falling back to PDF.js');
        
        // Fall back to PDF.js
        const pdf = await loadPDFFromBuffer(buffer);
        const numPages = pdf.numPages;
        
        for (let i = 1; i <= numPages; i++) {
          const base64 = await renderPageToBase64(pdf, i);
          pages.push(base64);
        }
        
        console.log(`[PDF.js] Successfully extracted ${pages.length} pages using PDF.js`);
      }
    } catch (error) {
      console.error('[PDF.js] Error in PDF extraction:', error);
      
      // Fall back to PDF.js if needed
      if (pages.length === 0) {
        console.log('[PDF.js] Falling back to PDF.js after extraction error');
        const pdf = await loadPDFFromBuffer(buffer);
        const numPages = pdf.numPages;
        
        for (let i = 1; i <= numPages; i++) {
          try {
            const base64 = await renderPageToBase64(pdf, i);
            pages.push(base64);
          } catch (pageError) {
            console.error(`[PDF.js] Error rendering page ${i}:`, pageError);
            // Create a blank page as fallback
            const blankPage = createBlankPage(612, 792, `Page ${i} (Error: ${pageError instanceof Error ? pageError.message : 'Unknown error'})`);
            pages.push(blankPage);
          }
        }
      }
    }
    
    // Clean up the temporary directory
    try {
      fs.unlinkSync(pdfPath);
      fs.rmdirSync(tempDir);
      console.log(`[PDF.js] Cleaned up temporary directory: ${tempDir}`);
    } catch (cleanupError) {
      console.error('[PDF.js] Error cleaning up temporary files:', cleanupError);
    }
    
    return {
      pages,
      numPages: pages.length
    };
  } catch (error) {
    console.error('[PDF.js] Error in PDF extraction:', error);
    throw error;
  }
}

/**
 * Check if pdftoppm is available on the system
 */
async function isPdftoppmAvailable(): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const process = spawn('pdftoppm', ['-v']);
    
    process.on('error', () => {
      resolve(false);
    });
    
    process.on('close', code => {
      resolve(code === 0);
    });
  });
}

/**
 * Convert a PDF to PNG images using pdftoppm
 */
async function convertPdfToPng(pdfPath: string, outputDir: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const outputPrefix = path.join(outputDir, 'page');
    
    const process = spawn('pdftoppm', [
      '-png',
      '-r', OPTIMAL_DPI.toString(),
      pdfPath,
      outputPrefix
    ]);
    
    let stderr = '';
    
    process.stderr.on('data', data => {
      stderr += data.toString();
    });
    
    process.on('error', err => {
      reject(new Error(`Failed to run pdftoppm: ${err.message}`));
    });
    
    process.on('close', code => {
      if (code !== 0) {
        reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
        return;
      }
      
      // Find all generated PNG files
      const outputFiles = fs.readdirSync(outputDir)
        .filter(file => file.startsWith('page-') && file.endsWith('.png'))
        .map(file => path.join(outputDir, file))
        .sort();
      
      resolve(outputFiles);
    });
  });
}

/**
 * Create a blank page with a message
 */
function createBlankPage(width: number, height: number, message: string): string {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  
  // Fill with white
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  
  // Add error message
  context.font = '16px Arial';
  context.fillStyle = '#FF0000';
  context.fillText(message, 20, height / 2);
  
  return canvas.toBuffer().toString('base64');
}

/**
 * Load a PDF from a buffer with robust error handling and retries
 */
export async function loadPDFFromBuffer(buffer: Buffer): Promise<PDFDocumentProxy> {
  let loadingTask = null;
  let attempt = 1;
  const MAX_ATTEMPTS = 3;
  
  while (attempt <= MAX_ATTEMPTS) {
    try {
      console.log(`[PDF.js] Starting to load PDF (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      console.log(`[PDF.js] Buffer size: ${buffer.length} bytes`);

      if (buffer.length === 0) {
        throw new Error('PDF buffer is empty');
      }
      
      // Ensure PDF.js is initialized
      console.log(`[PDF.js] Getting configuration...`);
      const config = await ensurePDFJSInit();
      console.log(`[PDF.js] Using config:`, config);
      
      // Convert Buffer to Uint8Array
      const uint8Array = new Uint8Array(buffer);
      console.log(`[PDF.js] Converted buffer to Uint8Array`);
      
      // Create loading task with minimal options for better reliability
      console.log(`[PDF.js] Creating document loading task...`);
      loadingTask = getDocument({
        data: uint8Array,
        ...config,
        cMapPacked: true,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true
      });
      
      // Race the loading task against the timeout
      console.log(`[PDF.js] Starting document load with timeout...`);
      const pdf = await Promise.race([
        loadingTask.promise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('PDF loading timeout')), PAGE_TIMEOUT);
        })
      ]) as PDFDocumentProxy;
      
      if (!pdf) {
        throw new Error('PDF loading failed: document is null');
      }
      
      if (!pdf.numPages || pdf.numPages === 0) {
        throw new Error('PDF file contains no pages');
      }
      
      console.log(`[PDF.js] Successfully loaded PDF with ${pdf.numPages} pages`);
      
      // Make an early attempt to access a page to verify the PDF is properly loaded
      try {
        console.log(`[PDF.js] Verifying PDF by accessing first page...`);
        const page = await Promise.race([
          pdf.getPage(1),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Page verification timeout')), 10000);
          })
        ]);
        
        console.log(`[PDF.js] Successfully verified PDF by accessing first page`);
        
        // If we got here, the PDF is valid and accessible
        // Clear buffer after successful loading
        buffer.fill(0);
        uint8Array.fill(0);
        
        return pdf;
      } catch (pageError) {
        console.error(`[PDF.js] Error verifying PDF by accessing first page:`, pageError);
        throw new Error(`PDF verification failed: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
      }
    } catch (error) {
      console.error(`[PDF.js] Error loading PDF (attempt ${attempt}/${MAX_ATTEMPTS}):`, error);
      
      // Clean up resources
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try {
          loadingTask.destroy();
          console.log(`[PDF.js] Destroyed loading task after error`);
        } catch (destroyError) {
          console.error(`[PDF.js] Error destroying loading task:`, destroyError);
        }
      }
      
      // If this was our last attempt, throw the error
      if (attempt === MAX_ATTEMPTS) {
        throw error instanceof Error 
          ? new Error(`Failed to load PDF after ${MAX_ATTEMPTS} attempts: ${error.message}`)
          : new Error(`Failed to load PDF after ${MAX_ATTEMPTS} attempts`);
      }
      
      // Otherwise, wait before trying again
      const waitTime = 1000 * attempt; // Progressive backoff
      console.log(`[PDF.js] Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      attempt++;
    }
  }
  
  // This should never be reached due to the throw in the loop above
  throw new Error(`Failed to load PDF after ${MAX_ATTEMPTS} attempts`);
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
    
    // Prepare render context with type cast to satisfy PDF.js requirements
    const renderContext = {
      canvasContext: context as unknown as any,
      viewport
    } as RenderParameters;
    
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
 * Render a specific page to base64
 */
export async function renderPageToBase64(
  pdf: PDFDocumentProxy,
  pageNum: number
): Promise<string> {
  console.log(`[PDF.js] Starting rendering of page ${pageNum}`);
  
  try {
    // Get the page
    console.log(`[PDF.js] Getting page ${pageNum}...`);
    const page = await pdf.getPage(pageNum);
    console.log(`[PDF.js] Successfully retrieved page ${pageNum}`);
    
    // Get page dimensions
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const { width, height } = viewport;
    console.log(`[PDF.js] Page ${pageNum} viewport: ${width}x${height} (scale: ${RENDER_SCALE})`);
    
    // Create a canvas
    console.log(`[PDF.js] Creating canvas for page ${pageNum}`);
    const canvas = createCanvas(Math.floor(width), Math.floor(height));
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Failed to get canvas context');
    }
    
    // Clear the canvas
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Prepare render context
    const renderContext: any = {
      canvasContext: context,
      viewport,
    };
    
    // Render the page
    console.log(`[PDF.js] Starting page ${pageNum} rendering...`);
    
    try {
      // Add a timeout to prevent hanging
      const renderPromise = page.render(renderContext).promise;
      
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Rendering page ${pageNum} timed out after ${PAGE_TIMEOUT / 1000} seconds`));
        }, PAGE_TIMEOUT);
      });
      
      await Promise.race([renderPromise, timeoutPromise]);
      console.log(`[PDF.js] Successfully rendered page ${pageNum}`);
      
      // Convert to base64
      const base64Data = canvas.toBuffer().toString('base64');
      console.log(`[PDF.js] Successfully converted page ${pageNum} to base64 (${Math.round(base64Data.length / 1024)}KB)`);
      
      return base64Data;
    } catch (renderError) {
      console.error(`[PDF.js] Error rendering page ${pageNum}:`, renderError);
      
      // Fallback: try to return a blank canvas if rendering fails
      console.log(`[PDF.js] Using fallback blank canvas for page ${pageNum}`);
      const blankCanvas = createCanvas(Math.floor(width), Math.floor(height));
      const blankContext = blankCanvas.getContext('2d');
      
      if (blankContext) {
        blankContext.fillStyle = '#FFFFFF';
        blankContext.fillRect(0, 0, blankCanvas.width, blankCanvas.height);
        blankContext.font = '24px Arial';
        blankContext.fillStyle = '#000000';
        blankContext.fillText(`Page ${pageNum} (rendering failed)`, 100, 100);
        
        return blankCanvas.toBuffer().toString('base64');
      }
      
      throw renderError;
    }
  } catch (error) {
    console.error(`[PDF.js] Error in renderPageToBase64 for page ${pageNum}:`, error);
    throw error;
  }
}