import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import Canvas from 'canvas';

// Configure pdf.js for server-side use
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

/**
 * Load a PDF from a buffer
 */
export async function loadPDFFromBuffer(buffer: Buffer) {
  return await pdfjsLib.getDocument({
    data: buffer,
    disableAutoFetch: true,
    disableStream: false,
  }).promise;
}

/**
 * Render a PDF page to base64
 */
export async function renderPageToBase64(page: any): Promise<string> {
  // Calculate scale for good quality
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  
  // Create canvas using node-canvas
  const canvas = Canvas.createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  // Set canvas dimensions
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  // Render PDF page to canvas
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;
  
  // Convert to base64
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return dataUrl.split(',')[1]; // Remove the data:image/jpeg;base64, prefix
}

/**
 * Render a PDF page to buffer
 */
export async function renderPageToBuffer(page: any): Promise<Buffer> {
  // Calculate scale for good quality
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  
  // Create canvas using node-canvas
  const canvas = Canvas.createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  // Set canvas dimensions
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  // Render PDF page to canvas
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;
  
  // Convert to buffer
  return canvas.toBuffer('image/png');
}