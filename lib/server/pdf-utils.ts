import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { createCanvas } from 'canvas';

// Initialize PDF.js for Node.js environment
// Note: In Node.js, we need to set the worker path differently
if (typeof window === 'undefined') {
  // We're in a Node.js environment
  // For Node.js, we don't need to set the worker path as it's handled differently
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

/**
 * Render a PDF page to a buffer
 */
export async function renderPageToBuffer(page: PDFPageProxy): Promise<Buffer> {
  try {
    // Calculate optimal scale for OCR (minimum 300 DPI)
    const OPTIMAL_DPI = 300;
    const scale = OPTIMAL_DPI / 72; // Convert from PDF points to pixels
    const scaledViewport = page.getViewport({ scale });
    
    // Create canvas with the right dimensions
    const canvas = createCanvas(
      Math.floor(scaledViewport.width), 
      Math.floor(scaledViewport.height)
    );
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    
    // Clear canvas with white background
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Render the PDF page to the canvas
    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;
    
    // Convert canvas to buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error rendering PDF page:', error);
    throw new Error('Failed to render PDF page');
  }
}

/**
 * Render a PDF page to base64
 */
export async function renderPageToBase64(page: PDFPageProxy): Promise<string> {
  try {
    const buffer = await renderPageToBuffer(page);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error rendering PDF page to base64:', error);
    throw new Error('Failed to render PDF page to base64');
  }
}

/**
 * Load a PDF from a buffer
 */
export async function loadPDFFromBuffer(buffer: Buffer) {
  try {
    // For Node.js environment, we need to disable the worker
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      disableWorker: true, // Disable worker for server-side rendering
    });
    
    const pdf = await loadingTask.promise;
    
    if (pdf.numPages === 0) {
      throw new Error('PDF file contains no pages');
    }
    
    return pdf;
  } catch (error) {
    console.error('Error loading PDF:', error);
    throw error instanceof Error 
      ? new Error(`Failed to load PDF: ${error.message}`)
      : new Error('Failed to load PDF file');
  }
} 