import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js
if (typeof window === 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

/**
 * Load a PDF from a buffer or URL
 */
export async function loadPDF(source: Buffer | string) {
  return await pdfjsLib.getDocument({
    data: source instanceof Buffer ? source : undefined,
    url: typeof source === 'string' ? source : undefined,
    disableAutoFetch: true,
    disableStream: false,
  }).promise;
}

/**
 * Render a PDF page to base64
 */
export async function renderPageToBase64(page: any): Promise<string> {
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  if (!context) throw new Error('Could not get canvas context');
  
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;
  
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Get the number of pages in a PDF buffer
 */
export async function getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

/**
 * Check if a buffer is a valid PDF
 */
export async function isValidPDF(buffer: Buffer): Promise<boolean> {
  try {
    await PDFDocument.load(buffer);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get PDF metadata
 */
export async function getPDFMetadata(pdfBuffer: Buffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle() || undefined,
    author: pdfDoc.getAuthor() || undefined,
    subject: pdfDoc.getSubject() || undefined,
    keywords: pdfDoc.getKeywords() || undefined,
    creator: pdfDoc.getCreator() || undefined,
    producer: pdfDoc.getProducer() || undefined,
    creationDate: pdfDoc.getCreationDate() || undefined,
    modificationDate: pdfDoc.getModificationDate() || undefined
  };
}