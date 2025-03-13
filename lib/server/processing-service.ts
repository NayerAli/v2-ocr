import { v4 as uuidv4 } from 'uuid';
import type { ProcessingStatus, OCRResult, OCRSettings } from '@/types';
import type { ProcessingSettings, UploadSettings } from '@/types/settings';
import { db } from './database';
import { getSettings } from './settings';
import { createOCRProvider } from '../ocr/providers';
import { AzureRateLimiter, MistralRateLimiter } from '../ocr/rate-limiter';
import { MistralOCRProvider } from '../ocr/providers/mistral';
import { loadPDFFromBuffer, renderPageToBase64, renderPageToBuffer } from './pdf-utils';
import { supabase, isSupabaseAvailable } from '../supabase';

// Singleton rate limiters
const azureRateLimiter = new AzureRateLimiter();
const mistralRateLimiter = new MistralRateLimiter();

// Active processing jobs
const activeJobs = new Map<string, AbortController>();

/**
 * Convert a file to base64
 */
async function fileToBase64(buffer: Buffer, mimeType: string): Promise<string> {
  return buffer.toString('base64');
}

/**
 * Process a PDF page
 */
async function processPage(
  pdf: any,
  pageNum: number,
  documentId: string,
  ocrProvider: any,
  signal: AbortSignal
): Promise<OCRResult> {
  try {
    // Get the page
    const page = await pdf.getPage(pageNum);
    
    // Render the page to a buffer
    const buffer = await renderPageToBuffer(page);
    
    // Convert buffer to base64
    const base64Data = buffer.toString('base64');
    
    // Upload image to Supabase storage
    const imageUrl = await uploadImageToStorage(`${documentId}/page-${pageNum}`, buffer, 'image/png');
    
    // Check if cancelled
    if (signal.aborted) {
      throw new Error('Processing cancelled');
    }
    
    // Process the image
    const result = await ocrProvider.processImage(base64Data, signal, 'image/png', pageNum, pdf.numPages);
    
    // Add document ID and page info
    result.documentId = documentId;
    result.pageNumber = pageNum;
    result.totalPages = pdf.numPages;
    result.imageUrl = imageUrl;
    
    return result;
  } catch (error: any) {
    // Create error result
    return {
      id: uuidv4(),
      documentId,
      text: '',
      confidence: 0,
      language: '',
      processingTime: 0,
      pageNumber: pageNum,
      error: error.message || 'Error processing page',
    };
  }
}

/**
 * Process a PDF document page by page
 */
async function processPageByPage(
  pdfBuffer: Buffer,
  status: ProcessingStatus,
  ocrProvider: any,
  processingSettings: ProcessingSettings,
  signal: AbortSignal,
  documentId: string
): Promise<OCRResult[]> {
  try {
    // Load the PDF with worker disabled for server-side rendering
    const pdf = await loadPDFFromBuffer(pdfBuffer);
    const numPages = pdf.numPages;
    
    // Update status with total pages
    status.totalPages = numPages;
    await db.saveToQueue(status);
    
    const results: OCRResult[] = [];
    const pagePromises: Promise<OCRResult>[] = [];
    
    // Process pages in chunks
    for (let i = 1; i <= numPages; i++) {
      // Check if processing was cancelled
      if (signal.aborted) {
        throw new Error('Processing cancelled');
      }
      
      // Add page to current chunk
      pagePromises.push(processPage(pdf, i, documentId, ocrProvider, signal));
      
      // If chunk is full or this is the last page, process the chunk
      if (pagePromises.length >= processingSettings.pagesPerChunk || i === numPages) {
        // Process the chunk
        const chunkResults = await Promise.all(pagePromises);
        results.push(...chunkResults);
        
        // Update status
        status.currentPage = i;
        status.progress = Math.round((i / numPages) * 100);
        await db.saveToQueue(status);
        
        // Clear the chunk
        pagePromises.length = 0;
      }
    }
    
    return results;
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    
    // Create error result
    return [{
      id: uuidv4(),
      documentId,
      text: '',
      confidence: 0,
      language: '',
      processingTime: 0,
      pageNumber: 1,
      error: error.message || 'Error processing PDF',
    }];
  }
}

/**
 * Process a file
 */
export async function processFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  settings?: {
    ocr?: OCRSettings;
    processing?: ProcessingSettings;
    upload?: UploadSettings;
  }
): Promise<{ id: string; status: ProcessingStatus }> {
  // Get settings
  const serverSettings = await getSettings();
  const ocr = settings?.ocr || serverSettings.ocr;
  const processing = settings?.processing || serverSettings.processing;
  const upload = settings?.upload || serverSettings.upload;
  
  // Create OCR provider
  const ocrProvider = createOCRProvider(ocr, azureRateLimiter);
  
  // Create abort controller
  const controller = new AbortController();
  const { signal } = controller;
  
  // Create status
  const id = uuidv4();
  const now = new Date();
  const status: ProcessingStatus = {
    id,
    filename: fileName,
    status: 'processing',
    progress: 0,
    currentPage: 0,
    totalPages: 0,
    size: fileBuffer.length,
    type: mimeType,
    startTime: Date.now(),
    createdAt: now,
    updatedAt: now,
  };
  
  // Save initial status
  await db.saveToQueue(status);
  
  // Add to active jobs
  activeJobs.set(id, controller);
  
  // Process the file asynchronously
  (async () => {
    try {
      let results: OCRResult[] = [];
      
      // For images
      if (mimeType.startsWith('image/')) {
        const base64 = await fileToBase64(fileBuffer, mimeType);
        
        // Check if cancelled
        if (signal.aborted) {
          throw new Error('Processing cancelled');
        }
        
        // Upload the image to Supabase storage
        const imageUrl = await uploadImageToStorage(id, fileBuffer, mimeType);
        
        // Process the image
        const result = await ocrProvider.processImage(base64, signal);
        result.documentId = id;
        result.imageUrl = imageUrl; // Use the Supabase storage URL instead of data URL
        
        results = [result];
      }
      // For PDFs
      else if (mimeType === 'application/pdf') {
        const fileSize = fileBuffer.length;
        const fileSizeMB = fileSize / (1024 * 1024);
        
        // Check if file is empty
        if (fileSize === 0) {
          throw new Error('PDF file is empty');
        }
        
        // Upload the PDF to Supabase storage
        const pdfUrl = await uploadFileToStorage(id, fileBuffer, mimeType, fileName);
        
        // Only attempt direct PDF processing with Mistral provider
        if (ocrProvider instanceof MistralOCRProvider) {
          // Check if we can process directly
          if (ocrProvider.canProcessPdfDirectly(fileSize)) {
            try {
              // Convert PDF to base64
              const base64Data = await fileToBase64(fileBuffer, mimeType);
              
              // Check if cancelled
              if (signal.aborted) {
                throw new Error('Processing cancelled');
              }
              
              // Process PDF directly
              const result = await ocrProvider.processPdfDirectly(base64Data, signal);
              result.documentId = id;
              result.fileUrl = pdfUrl; // Add the PDF URL to the result
              
              results = [result];
            } catch (error) {
              // If direct processing fails, fall back to page-by-page processing
              console.error('Error in direct PDF processing:', error);
              results = await processPageByPage(fileBuffer, status, ocrProvider, processing, signal, id);
            }
          } else {
            // Process page by page
            results = await processPageByPage(fileBuffer, status, ocrProvider, processing, signal, id);
          }
        } else {
          // For non-Mistral providers, always process page by page
          results = await processPageByPage(fileBuffer, status, ocrProvider, processing, signal, id);
        }
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
      
      // Update status
      status.status = 'completed';
      status.progress = 100;
      status.endTime = Date.now();
      status.completionTime = status.endTime - (status.startTime || 0);
      await db.saveToQueue(status);
      
      // Save results
      await db.saveResults(id, results);
      
      // Remove from active jobs
      activeJobs.delete(id);
    } catch (error: any) {
      console.error('Error processing file:', error);
      
      // Update status
      status.status = 'error';
      status.error = error.message || 'Unknown error';
      status.endTime = Date.now();
      await db.saveToQueue(status);
      
      // Remove from active jobs
      activeJobs.delete(id);
    }
  })();
  
  return { id, status };
}

/**
 * Cancel processing
 */
export async function cancelProcessing(id: string): Promise<boolean> {
  const controller = activeJobs.get(id);
  
  if (controller) {
    controller.abort();
    activeJobs.delete(id);
    
    // Update status
    const status = await db.getQueue().then(queue => queue.find(item => item.id === id));
    
    if (status) {
      status.status = 'cancelled';
      status.endTime = Date.now();
      await db.saveToQueue(status);
    }
    
    return true;
  }
  
  return false;
}

/**
 * Get processing status
 */
export async function getProcessingStatus(id: string): Promise<ProcessingStatus | null> {
  const queue = await db.getQueue();
  const status = queue.find(item => item.id === id);
  
  if (!status) {
    return null;
  }
  
  // If status is processing but not in active jobs, it was interrupted
  if (status.status === 'processing' && !activeJobs.has(id)) {
    status.status = 'failed';
    status.error = 'Processing was interrupted';
    await db.saveToQueue(status);
  }
  
  return status;
}

/**
 * Get all processing statuses
 */
export async function getAllProcessingStatuses(): Promise<ProcessingStatus[]> {
  const queue = await db.getQueue();
  
  // Update any orphaned processing jobs
  for (const status of queue) {
    if (status.status === 'processing' && !activeJobs.has(status.id)) {
      status.status = 'failed';
      status.error = 'Processing was interrupted';
      await db.saveToQueue(status);
    }
  }
  
  return queue;
}

/**
 * Upload an image to Supabase storage
 */
async function uploadImageToStorage(
  documentId: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const isSupabaseActive = await isSupabaseAvailable();
  
  if (isSupabaseActive) {
    try {
      // Create a unique filename
      const extension = mimeType.split('/')[1] || 'png';
      const filename = `${documentId}/image.${extension}`;
      
      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .upload(filename, buffer, {
          contentType: mimeType,
          upsert: true
        });
      
      if (error) {
        console.error('Error uploading image to Supabase storage:', error);
        // Fall back to base64 if upload fails
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('ocr-documents')
        .getPublicUrl(filename);
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error in Supabase storage upload:', error);
      // Fall back to base64
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
  } else {
    // Fall back to base64 for local development without Supabase
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }
}

/**
 * Upload a file to Supabase storage
 */
async function uploadFileToStorage(
  documentId: string,
  buffer: Buffer,
  mimeType: string,
  originalFilename: string
): Promise<string> {
  const isSupabaseActive = await isSupabaseAvailable();
  
  if (isSupabaseActive) {
    try {
      // Create a unique filename
      const extension = originalFilename.split('.').pop() || 'pdf';
      const filename = `${documentId}/${documentId}.${extension}`;
      
      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .upload(filename, buffer, {
          contentType: mimeType,
          upsert: true
        });
      
      if (error) {
        console.error('Error uploading file to Supabase storage:', error);
        return '';
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('ocr-documents')
        .getPublicUrl(filename);
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error in Supabase storage upload:', error);
      return '';
    }
  } else {
    // For local development without Supabase, return empty string
    return '';
  }
}

// ... existing code ... 