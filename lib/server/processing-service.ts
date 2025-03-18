import { v4 as uuidv4 } from 'uuid';
import type { ProcessingStatus, OCRResult, OCRSettings } from '@/types';
import type { ProcessingSettings, UploadSettings } from '@/types/settings';
import { db } from './database';
import { getSettings } from './settings';
import { createOCRProvider } from '../ocr/providers';
import { AzureRateLimiter, MistralRateLimiter } from '../ocr/rate-limiter';
import { FileProcessor } from './file-processor';
import { supabase, isSupabaseAvailable } from '../supabase';

// Singleton rate limiters
const azureRateLimiter = new AzureRateLimiter();
const mistralRateLimiter = new MistralRateLimiter();

// Active processing jobs
const activeJobs = new Map<string, AbortController>();
// Progress tracking
const processingProgress = new Map<string, {
  currentPage: number;
  totalPages: number;
  lastUpdate: number;
}>();

/**
 * Get the status of a processing job
 */
export async function getProcessingStatus(id: string): Promise<ProcessingStatus | null> {
  console.log(`[Processing] Getting status for job: ${id}`);
  
  try {
    const status = await db.getQueueItem(id);
    return status;
  } catch (error) {
    console.error(`[Processing] Error getting status for job ${id}:`, error);
    throw error;
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
  console.log('[Processing] Starting file processing:', {
    fileName,
    mimeType,
    bufferSize: fileBuffer.length,
    settings: {
      ocr: settings?.ocr?.provider,
      maxFileSize: settings?.upload?.maxFileSize,
      allowedTypes: settings?.upload?.allowedFileTypes
    }
  });

  // Get settings
  const serverSettings = await getSettings();
  const ocr = settings?.ocr || serverSettings.ocr;
  const processing = settings?.processing || serverSettings.processing;
  const upload = settings?.upload || serverSettings.upload;
  
  console.log('[Processing] Using settings:', {
    ocrProvider: ocr.provider,
    maxFileSize: upload.maxFileSize,
    allowedTypes: upload.allowedFileTypes
  });

  // Create OCR provider with rate limiter
  const ocrProvider = createOCRProvider(ocr, mistralRateLimiter);
  
  // Create abort controller
  const controller = new AbortController();
  const { signal } = controller;
  
  // Create status with required fields
  const id = uuidv4();
  const now = new Date();
  const startTime = Date.now();
  const status: ProcessingStatus = {
    id,
    filename: fileName,
    status: 'processing',
    progress: 0,
    currentPage: 0,
    totalPages: 0,
    size: fileBuffer.length,
    type: mimeType,
    startTime,
    createdAt: now,
    updatedAt: now,
  };
  
  console.log('[Processing] Created processing status:', status);

  // Save initial status
  await db.saveToQueue(status);
  
  // Add to active jobs
  activeJobs.set(id, controller);
  
  // Initialize progress tracking
  processingProgress.set(id, {
    currentPage: 0,
    totalPages: 0,
    lastUpdate: Date.now()
  });
  
  // Set up progress update interval
  const progressInterval = setInterval(async () => {
    try {
      const progress = processingProgress.get(id);
      if (progress && progress.currentPage > 0) {
        const currentTime = Date.now();
        // Only update if something has changed or it's been more than 5 seconds
        if (progress.currentPage !== status.currentPage || 
            progress.totalPages !== status.totalPages || 
            currentTime - progress.lastUpdate > 5000) {
          
          console.log(`[Processing] Updating progress for ${id}: ${progress.currentPage}/${progress.totalPages}`);
          
          // Update status object
          status.currentPage = progress.currentPage;
          status.totalPages = progress.totalPages;
          status.progress = progress.totalPages > 0 
            ? Math.round((progress.currentPage / progress.totalPages) * 100)
            : 0;
          status.updatedAt = new Date();
          
          // Save to database
          await db.saveToQueue(status);
          
          // Update last update time
          progress.lastUpdate = currentTime;
        }
      }
    } catch (error) {
      console.error(`[Processing] Error updating progress for ${id}:`, error);
    }
  }, 2000); // Check every 2 seconds

  // Start processing in background
  (async () => {
    try {
      // Create file processor
      const processor = new FileProcessor(processing, ocrProvider);
      
      // Set up page progress tracking
      const updateProgress = (currentPage: number, totalPages: number) => {
        const progress = processingProgress.get(id);
        if (progress) {
          progress.currentPage = currentPage;
          progress.totalPages = totalPages;
        }
      };
      
      // Monkey patch the processPage method to track progress
      const originalProcessPage = processor.processPage;
      if (originalProcessPage && typeof originalProcessPage === 'function') {
        // @ts-ignore - Adding private method access for monitoring
        processor.processPage = async function(pdf: any, pageNum: number, docId: string, totalPages: number, filename: string, signal: AbortSignal) {
          updateProgress(pageNum, totalPages);
          // @ts-ignore - Calling original method
          return await originalProcessPage.call(this, pdf, pageNum, docId, totalPages, filename, signal);
        };
      }
      
      // Process the file
      console.log('[Processing] Starting file processing...');
      const results = await processor.processFile(fileBuffer, fileName, mimeType, id, signal);
      
      // Save results
      console.log('[Processing] Saving results...');
      await db.saveResults(id, results);
      
      // Update status to completed
      status.status = 'completed';
      status.progress = 100;
      status.endTime = Date.now();
      status.completionTime = status.endTime - startTime;
      status.updatedAt = new Date();
      
      await db.saveToQueue(status);
      console.log('[Processing] Processing completed successfully');
    } catch (error) {
      console.error('[Processing] Error processing file:', error);
      
      // Update status to error
      status.status = 'error';
      status.error = error instanceof Error ? error.message : 'Unknown error occurred';
      status.endTime = Date.now();
      status.updatedAt = new Date();
      
      await db.saveToQueue(status);
    } finally {
      // Clean up
      clearInterval(progressInterval);
      processingProgress.delete(id);
      activeJobs.delete(id);
    }
  })();
  
  return { id, status };
}

/**
 * Cancel processing
 */
export async function cancelProcessing(id: string): Promise<boolean> {
  console.log(`[Processing] Cancelling job: ${id}`);
  
  // First check if it's an active job
  const controller = activeJobs.get(id);
  if (controller) {
    controller.abort();
    activeJobs.delete(id);
    
    try {
      // Update status to cancelled
      const status = await db.getQueueItem(id);
      if (status) {
        status.status = 'cancelled';
        status.endTime = Date.now();
        status.updatedAt = new Date();
        status.error = 'Processing cancelled by user';
        
        await db.saveToQueue(status);
        console.log(`[Processing] Job ${id} cancelled successfully`);
        return true;
      }
    } catch (error) {
      console.error(`[Processing] Error updating cancelled status for job ${id}:`, error);
    }
  } else {
    console.log(`[Processing] Job ${id} not found in active jobs, checking database`);
    
    // If not active, check if it exists in the database and update its status
    try {
      const status = await db.getQueueItem(id);
      if (status && (status.status === 'processing' || status.status === 'queued')) {
        status.status = 'cancelled';
        status.endTime = Date.now();
        status.updatedAt = new Date();
        status.error = 'Processing cancelled by user';
        
        await db.saveToQueue(status);
        console.log(`[Processing] Job ${id} marked as cancelled in database`);
        return true;
      } else if (status) {
        console.log(`[Processing] Job ${id} is already in final state: ${status.status}`);
        return false;
      }
    } catch (error) {
      console.error(`[Processing] Error updating cancelled status for job ${id}:`, error);
    }
  }
  
  return false;
} 