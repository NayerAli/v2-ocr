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
  const ocrProvider = createOCRProvider(ocr, azureRateLimiter);
  
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

  // Start processing in background
  (async () => {
    try {
      // Create file processor
      const processor = new FileProcessor(processing, ocrProvider);
      
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
      // Remove from active jobs
      activeJobs.delete(id);
    }
  })();
  
  return { id, status };
}

/**
 * Cancel processing
 */
export function cancelProcessing(id: string): void {
  const controller = activeJobs.get(id);
  if (controller) {
    controller.abort();
    activeJobs.delete(id);
  }
} 