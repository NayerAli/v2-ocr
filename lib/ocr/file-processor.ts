import type { OCRResult, ProcessingStatus } from "@/types";
import type { ProcessingSettings } from "@/types/settings";
import { renderPageToBase64, loadPDF } from "../pdf-utils";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OCRProvider } from "./providers/types";
import { MistralOCRProvider } from "./providers/mistral";
import { createFallbackOCRProvider } from "./providers/fallback-provider";
import { authCompat } from "@/lib/auth-compat";
import { createClient } from '@/utils/supabase/server'
import { serverAuthHelper } from "@/lib/server-auth-helper";
import { fileToBase64, base64ToBlob } from "./file-utils";
import { FallbackOCRProvider } from "./providers/fallback-provider";

// Configuration
const STORAGE_CONFIG = {
  // Default storage bucket name
  storageBucket: 'ocr-documents',
  // Default signed URL expiry time in seconds (24 hours)
  signedUrlExpiry: 86400
};

export class FileProcessor {
  private processingSettings: ProcessingSettings;
  private ocrProvider: OCRProvider;
  private extractedTexts: Record<string, string> = {};

  constructor(processingSettings: ProcessingSettings, ocrProvider: OCRProvider) {
    this.processingSettings = processingSettings;
    this.ocrProvider = ocrProvider;
  }

  /**
   * Load the latest processing settings from the user settings service
   * This ensures we always have the most up-to-date settings
   */
  private async loadSettings(): Promise<void> {
    const { userSettingsService } = await import('@/lib/user-settings-service');
    // Use the serverContext option to ensure consistent settings in background processing
    this.processingSettings = await userSettingsService.getProcessingSettings({ serverContext: true });
  }

  /**
   * Update processing settings
   */
  updateProcessingSettings(settings: ProcessingSettings): void {
    this.processingSettings = settings;
  }

  /**
   * Update OCR provider
   */
  updateOCRProvider(provider: OCRProvider): void {
    this.ocrProvider = provider;
  }

  /**
   * Check if we have a valid OCR provider with an API key
   */
  async hasValidOCRProvider(): Promise<boolean> {
    const { infoLog } = await import('@/lib/log');
    // Check if the OCR provider has a valid API key
    if (!this.ocrProvider) {
      infoLog('[DEBUG] No OCR provider available');
      return false;
    }

    // Check if the provider has an API key
    // We need to access the settings property which might be private
    // @ts-expect-error - Accessing private property for debugging
    const apiKey = this.ocrProvider.settings?.apiKey;
    // @ts-expect-error - Accessing private property for debugging
    const useSystemKey = this.ocrProvider.settings?.useSystemKey;

    // If using system key is enabled, consider it valid regardless of API key
    if (useSystemKey) {
      infoLog('[DEBUG] Using system key for OCR provider');
      return true;
    }

    // Otherwise check for API key presence
    const isValid = !!apiKey && apiKey.length > 0;

    infoLog('[DEBUG] OCR provider API key check:', {
      isValid,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      useSystemKey: !!useSystemKey
    });

    return isValid;
  }

  async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    // Load the latest settings before processing
    await this.loadSettings();

    if (!status.file) throw new Error("No file to process");

    // Use infoLog instead of console.log
    const { infoLog } = await import('@/lib/log');
    infoLog(`[Process] Starting ${status.filename}`);

    // Ensure we have a user ID
    if (!status.user_id) {
      infoLog('[Process] Warning: No user ID in status object');
      try {
        const { getUser } = await import('@/lib/auth');
        const user = await getUser();
        if (user) {
          status.user_id = user.id;
          infoLog(`[Process] Retrieved user ID from auth: ${status.user_id}`);
        }
      } catch (userError) {
        infoLog('[Process] Could not retrieve user ID from auth');
        throw new Error("User ID missing from status object and could not be retrieved");
      }
    }

    // Check if we have a valid OCR provider
    const hasValidProvider = await this.hasValidOCRProvider();
    if (!hasValidProvider) {
      infoLog(`[Process] No valid OCR provider available for processing ${status.filename}, but continuing with fallback provider`);
      // We'll continue with the fallback provider that was set in the constructor
    }

    // For images
    if (status.file.type.startsWith("image/")) {
      const base64 = await fileToBase64(status.file);
      if (signal.aborted) throw new Error("Processing aborted");
      infoLog(`[Process] Processing image: ${status.filename}`);

      // Use the user ID from the status object instead of trying to authenticate
      if (!status.user_id) {
        throw new Error("User ID missing from status object");
      }

      const userId = status.user_id;

      // Use the storage path from the status object (already uploaded in queue manager)
      const path = status.storagePath;
      if (!path) {
        throw new Error("Storage path is missing from status object");
      }

      infoLog(`[Process] Using existing image at path: ${path}`);

      // Generate a signed URL for the image
      const imageUrl = await this.generateSignedUrl(path, userId);
      infoLog(`[Process] Generated signed URL for image: ${imageUrl.substring(0, 50)}...`);

      // Process the image with OCR
      infoLog(`[OCR] Using ${this.ocrProvider.constructor.name} to process image`);
      const result = await this.processImage(base64, status.id, userId, path, signal);

      // Save the result to the database
      const saved = await this.saveOCRResult(result, status);
      if (saved) {
        infoLog(`[Process] Saved result for image: ${status.filename}`);
      } else {
        infoLog(`[Process] Failed to save result for image: ${status.filename}`);
        // Mark the result with an error flag to indicate save failure
        result.error = "Failed to save OCR result to database";
        // Throw an error to mark the document as failed
        throw new Error("Failed to save OCR result to database. Document processing cannot be completed.");
      }

      infoLog(`[Process] Completed image: ${status.filename}`);
      return [result];
    }

    // For PDFs
    if (status.file.type === "application/pdf") {
      try {
        infoLog(`[Process] Processing PDF: ${status.filename}`);
        const fileSize = status.file.size;
        const fileSizeMB = fileSize / (1024 * 1024);
        infoLog(`[Process] PDF file size: ${Math.round(fileSizeMB * 100) / 100}MB`);

        // Check if file is empty
        if (fileSize === 0) {
          throw new Error("PDF file is empty");
        }

        // Load PDF using our optimized loading function
        infoLog(`[Process] Loading PDF file...`);
        let pdf;
        let numPages;

        // For server-side processing, we'll use a simplified approach
        // that doesn't rely on PDF.js for page extraction
        const isServer = typeof window === 'undefined';

        if (isServer) {
          // In server environment, we'll use a simplified approach
          infoLog(`[Process] Using simplified server-side PDF processing`);

          try {
            // Use proper PDF parsing to get the actual page count
            infoLog(`[Process] Loading PDF on server using PDF.js`);

            // Convert File to Buffer
            const arrayBuffer = await status.file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Use the loadPDFServer function to properly load the PDF
            const { loadPDFServer } = await import('../pdf-utils-server');
            const serverPdf = await loadPDFServer(buffer);

            // Get the actual page count
            numPages = serverPdf.numPages;
            status.totalPages = numPages;

            infoLog(`[Process] Successfully loaded PDF with ${numPages} actual pages`);

            // Use the properly loaded PDF
            pdf = serverPdf;
          } catch (error) {
            infoLog(`[Process] Error in simplified PDF processing: ${error}`);
            throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          // In browser environment, use the client-side PDF loading with PDF.js
          try {
            infoLog(`[Process] Using client-side PDF loading with PDF.js`);
            pdf = await loadPDF(status.file);
            numPages = pdf.numPages;
            status.totalPages = numPages;
            infoLog(`[Process] Successfully loaded PDF with ${numPages} pages`);
          } catch (pdfError) {
            // Handle PDF loading errors specifically
            infoLog(`[Process] Error loading PDF with PDF.js: ${pdfError}`);

            // Check for Promise.withResolvers error
            if (pdfError instanceof Error && pdfError.message.includes('Promise.withResolvers')) {
              throw new Error("Failed to load PDF: Promise.withResolvers is not a function. This is a compatibility issue with PDF.js.");
            }

            // Check for worker-related errors
            if (pdfError instanceof Error && (pdfError.message.includes('worker') || pdfError.message.includes('Worker'))) {
              throw new Error(`Failed to load PDF: Worker error. Try using disableWorker: true. Details: ${pdfError.message}`);
            }

            throw pdfError;
          }
        }

        // Only attempt direct PDF processing with Mistral provider
        if (this.ocrProvider instanceof MistralOCRProvider) {
          // Check if we can process directly
          if (this.ocrProvider.canProcessPdfDirectly(fileSize, numPages)) {
            infoLog(`[Process] PDF is within Mistral limits (${numPages} pages, ${Math.round(fileSizeMB)}MB). Processing directly.`);

            try {
              // Convert PDF to base64
              const base64Data = await fileToBase64(status.file);
              infoLog(`[Process] Successfully converted PDF to base64`);

              // Check if cancelled
              if (signal.aborted) {
                infoLog(`[Process] Processing aborted for ${status.filename}`);
                throw new Error("Processing aborted");
              }

              // Use the user ID from the status object instead of trying to authenticate
              if (!status.user_id) {
                throw new Error("User ID missing from status object");
              }

              const userId = status.user_id;

              // Generate a unique ID for the OCR result
              const resultId = crypto.randomUUID();

              // Use the storage path from the status object (already uploaded in queue manager)
              const pdfPath = status.storagePath;
              if (!pdfPath) {
                throw new Error("Storage path is missing from status object");
              }

              infoLog(`[Process] Using existing PDF at path: ${pdfPath}`);

              // Generate a signed URL for the PDF
              const pdfUrl = await this.generateSignedUrl(pdfPath, userId);

              // Process PDF directly
              infoLog(`[Process] Sending PDF to Mistral OCR API`);
              const result = await this.ocrProvider.processPdfDirectly(base64Data, signal);
              result.id = resultId; // Use the same ID we generated for the file name
              result.documentId = status.id;
              result.pageNumber = 1; // Set page number to 1 for direct processing
              result.totalPages = numPages;
              result.storagePath = pdfPath;
              // Set both camelCase and snake_case versions of the image URL field
              result.imageUrl = pdfUrl; // camelCase version
              result.image_url = pdfUrl; // snake_case version for database compatibility
              infoLog(`[Process] Generated signed URL for PDF: ${pdfUrl.substring(0, 50)}...`);

              // Import database service for saving the result
              const { db } = await import('@/lib/database');

              try {
                // Save the result to the database
                await db.saveResults(status.id, [result]);
                infoLog(`[Process] Saved result for direct PDF processing: ${status.filename}`);
              } catch (saveError) {
                infoLog(`[Process] Failed to save result for direct PDF processing: ${status.filename}`);
                // Mark the result with an error flag to indicate save failure
                result.error = "Failed to save OCR result to database";
                // Throw an error to mark the document as failed
                throw new Error("Failed to save OCR result to database. Document processing cannot be completed.");
              }

              infoLog(`[Process] Completed PDF direct processing: ${status.filename}`);
              return [result];
            } catch (error) {
              // If direct processing fails, fall back to page-by-page processing
              infoLog(`[Process] Error in direct PDF processing:`, error);
              infoLog(`[Process] Falling back to page-by-page processing`);
              return this.processPageByPage(pdf, status, signal);
            }
          } else {
            infoLog(`[Process] PDF exceeds Mistral limits. Processing page by page.`);
            return this.processPageByPage(pdf, status, signal);
          }
        } else {
          // For non-Mistral providers, always process page by page
          infoLog(`[Process] Using non-Mistral provider. Processing PDF page by page.`);
          return this.processPageByPage(pdf, status, signal);
        }
      } catch (error) {
        infoLog(`[Process] Error processing PDF: ${error}`);
        throw error;
      }
    }

    throw new Error(`Unsupported file type: ${status.file.type}`);
  }

  private async processPageByPage(pdf: PDFDocumentProxy | any, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    // Load the latest settings before processing
    await this.loadSettings();

    // Import infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');
    // Import database service for immediate saving
    const { db } = await import('@/lib/database');

    // Verify we have a valid PDF object
    if (!pdf || typeof pdf.numPages !== 'number') {
      infoLog(`[Process] Error: Invalid PDF object`);
      throw new Error("Invalid PDF object");
    }

    const numPages = pdf.numPages;
    infoLog(`[Process] PDF has ${numPages} pages`);

    // Update the status with the actual page count
    status.totalPages = numPages;

    // Save to queue with updated page count
    await db.saveToQueue(status);

    const results: OCRResult[] = [];

    // The original PDF file is already uploaded in the queue manager
    // We can use the storage path from the status object
    infoLog(`[Process] Using existing PDF at path: ${status.storagePath || 'unknown'}`);

    // Check if we have a valid storage path
    if (!status.storagePath) {
      infoLog(`[Process] Warning: Storage path is missing from status object`);
      // Continue processing anyway, as we can still process the PDF pages
    }

    // Ensure we have a valid user ID before starting
    if (!status.user_id) {
      infoLog(`[Process] Error: User ID missing from status object`);
      throw new Error("User ID is required for processing");
    }

    // Get only the required processing settings with minimal defaults
    const {
      pagesPerChunk = 2,
      concurrentChunks = 1,
      pagesPerBatch = pagesPerChunk
    } = this.processingSettings;

    const chunks = Math.ceil(numPages / pagesPerChunk);
    infoLog(`[Process] Processing PDF in ${chunks} chunks of ${pagesPerChunk} pages each`);

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      if (signal.aborted) {
        infoLog(`[Process] Processing aborted for ${status.filename}`);
        throw new Error("Processing aborted");
      }

      const startPage = chunkIndex * pagesPerChunk + 1;
      const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, numPages);
      infoLog(`[Process] Processing chunk ${chunkIndex + 1}/${chunks} (pages ${startPage}-${endPage})`);

      try {
        // Process pages in smaller batches for better memory management
        const batchCount = Math.ceil((endPage - startPage + 1) / pagesPerBatch);
        const chunkResults: OCRResult[] = [];

        for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
          const batchStartPage = startPage + batchIndex * pagesPerBatch;
          const batchEndPage = Math.min(startPage + (batchIndex + 1) * pagesPerBatch - 1, endPage);

          infoLog(`[Process] Processing batch ${batchIndex + 1}/${batchCount} (pages ${batchStartPage}-${batchEndPage})`);

          const batchPromises: Promise<OCRResult>[] = [];
          for (let pageNum = batchStartPage; pageNum <= batchEndPage; pageNum++) {
            if (signal.aborted) {
              infoLog(`[Process] Processing aborted for ${status.filename}`);
              throw new Error("Processing aborted");
            }
            batchPromises.push(this.processPage(pdf, pageNum, status, signal));
          }

          // Process pages in parallel within the batch
          const batchResults = await this.processInBatches(batchPromises, concurrentChunks);

          // Add document ID and page number to each result and save immediately
          for (let i = 0; i < batchResults.length; i++) {
            const pageNum = batchStartPage + i;
            batchResults[i].documentId = status.id;
            batchResults[i].pageNumber = pageNum;
            batchResults[i].totalPages = numPages;

            // Save each result immediately
            await db.saveResults(status.id, [batchResults[i]]);

            // Update progress after each page
            const processedCount = pageNum; // Number of pages processed so far
            const progressPercentage = Math.floor((processedCount / numPages) * 100);
            status.progress = progressPercentage;
            status.currentPage = pageNum;

            // Ensure original_filename is set before saving to queue
            if (!status.originalFilename) {
              status.originalFilename = status.filename;
            }

            // Save to queue with updated progress
            await db.saveToQueue(status);

            // Log progress
            infoLog(`[Process] Saved result for page ${pageNum}, progress: ${progressPercentage}%`);

            // Force a small delay between pages to allow downstream systems to process
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          chunkResults.push(...batchResults);
        }

        results.push(...chunkResults);
      } catch (error) {
        const { infoLog } = await import('@/lib/log');
        infoLog(`[Process] Error processing chunk ${chunkIndex + 1}: ${error}`);
        // Continue with next chunk instead of failing the entire process
        if (!signal.aborted) {
          infoLog(`[Process] Continuing with next chunk...`);
          continue;
        } else {
          throw error;
        }
      }

      // Update progress after each chunk
      status.progress = Math.floor((endPage / numPages) * 100);
      status.currentPage = endPage;

      // Ensure original_filename is set before saving to queue
      if (!status.originalFilename) {
        status.originalFilename = status.filename;
      }

      await db.saveToQueue(status);
      infoLog(`[Process] Progress: ${status.progress}% (${endPage}/${numPages} pages)`);
    }

    // Clean up resources
    try {
      // Close the PDF document to free up resources
      if (pdf && typeof pdf.destroy === 'function') {
        await pdf.destroy();
      }
    } catch (error) {
      const { infoLog } = await import('@/lib/log');
      infoLog(`[Process] Error cleaning up PDF resources: ${error}`);
      // Continue even if cleanup fails
    }

    infoLog(`[Process] Completed PDF: ${status.filename}`);
    return results;
  }

  private async processPage(pdf: PDFDocumentProxy | any, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
    const { infoLog } = await import('@/lib/log');

    try {
      infoLog(`[Process] Starting to process page ${pageNum} of ${status.filename}`);

      // Ensure we have a valid user ID before starting
      if (!status.user_id) {
        infoLog(`[Process] Error: User ID missing from status object`);
        throw new Error("User ID is required for processing");
      }

      const userId = status.user_id;

      // Get the page from the PDF
      const page = await pdf.getPage(pageNum);

      // Generate a unique ID for this page result
      const resultId = crypto.randomUUID();

      // Create a consistent storage path for the rendered page
      // Format: userId/documentId/Page_pageNum_uniqueId.png
      const pagePath = `${userId}/${status.id}/Page_${pageNum}_${resultId}.png`;

      // Render the page to a base64 image
      const isServer = typeof window === 'undefined';
      let base64Data: string;

      try {
        if (isServer) {
          const { renderPageToBase64Server } = await import('../pdf-utils-server');
          infoLog(`[Process] Rendering page ${pageNum} on server with scale 2.0`);
          base64Data = await renderPageToBase64Server(page, 2.0);
          infoLog(`[Process] Page ${pageNum} rendered successfully on server, data length: ${base64Data?.length || 0}`);
        } else {
          infoLog(`[Process] Rendering page ${pageNum} in browser`);
          base64Data = await renderPageToBase64(page);
          infoLog(`[Process] Page ${pageNum} rendered successfully in browser, data length: ${base64Data?.length || 0}`);
        }
      } catch (renderError) {
        infoLog(`[Process] Error rendering page ${pageNum}: ${renderError instanceof Error ? renderError.message : String(renderError)}`);
        throw new Error(`Failed to render page ${pageNum}: ${renderError instanceof Error ? renderError.message : String(renderError)}`);
      }

      if (signal.aborted) throw new Error("Processing aborted");

      // Upload the rendered page to storage
      infoLog(`[Process] Uploading rendered page ${pageNum} to storage`);

      // Validate and clean the base64 data
      const { validateAndCleanBase64 } = await import('@/lib/file-utils');
      const cleanBase64 = validateAndCleanBase64(base64Data);

      if (!cleanBase64) {
        infoLog(`[Process] Error: Invalid base64 data for page ${pageNum}`);
        throw new Error(`Invalid base64 data for page ${pageNum}`);
      }

      // Convert base64 to blob - use PNG for better quality
      const blob = await base64ToBlob(cleanBase64, 'image/png');

      // Upload to storage
      const supabase = createClient();
      const { error: uploadError } = await supabase
        .storage
        .from(STORAGE_CONFIG.storageBucket)
        .upload(pagePath, blob, { upsert: true });

      if (uploadError) {
        infoLog(`[Process] Error uploading page ${pageNum} to storage:`, uploadError);
        throw new Error(`Failed to upload rendered page ${pageNum} to storage`);
      }

      infoLog(`[Process] Successfully uploaded page ${pageNum} to ${pagePath}`);

      // Generate a signed URL for the uploaded page
      const { data: urlData, error: urlError } = await supabase
        .storage
        .from(STORAGE_CONFIG.storageBucket)
        .createSignedUrl(pagePath, STORAGE_CONFIG.signedUrlExpiry);

      if (urlError || !urlData?.signedUrl) {
        infoLog(`[Process] Error generating signed URL for page ${pageNum}:`, urlError);
        throw new Error(`Failed to generate signed URL for page ${pageNum}`);
      }

      const pageUrl = urlData.signedUrl;
      infoLog(`[Process] Generated signed URL for page ${pageNum}`);

      // Process the page with OCR
      infoLog(`[Process] Processing page ${pageNum} with ${this.ocrProvider.constructor.name}, data length: ${cleanBase64.length}`);

      const result = await this.ocrProvider.processImage(
        cleanBase64,
        signal,
        'image/png',
        pageNum,
        status.totalPages
      );

      // Set additional fields on the result
      result.id = resultId;
      result.documentId = status.id;
      result.user_id = userId;
      result.pageNumber = pageNum;
      result.totalPages = status.totalPages;
      result.storagePath = pagePath;
      result.imageUrl = pageUrl;
      result.image_url = pageUrl; // Add snake_case version for database compatibility

      infoLog(`[Process] Completed page ${pageNum}, text length: ${result.text.length}`);
      return result;
    } catch (error) {
      infoLog(`[Process] Error processing page ${pageNum} of ${status.filename}:`, error);
      return {
        id: crypto.randomUUID(),
        documentId: status.id,
        text: `Error processing page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
        language: "unknown",
        processingTime: 0,
        pageNumber: pageNum,
        totalPages: status.totalPages,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // File conversion methods have been moved to file-utils.ts

  private async processInBatches<T>(promises: Promise<T>[], batchSize: number): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    return results;
  }

  // MIME type handling has been moved to file-utils.ts

  /**
   * Generate a signed URL for a file in Supabase storage
   */
  private async generateSignedUrl(storagePath: string, userId?: string): Promise<string> {
    try {
      const supabase = createClient();

      // If no user ID is provided, try to authenticate
      if (!userId) {
        const { infoLog } = await import('@/lib/log');
        infoLog('[Process] No user ID provided for signed URL generation. Trying to authenticate...');

        const user = await authCompat.getUser();
        if (!user) {
          infoLog('[Process] User not authenticated. Cannot generate signed URL.');
          return '';
        }

        userId = user.id;
      }

      // Create a signed URL that expires in the configured time
      const { data, error } = await supabase.storage
        .from(STORAGE_CONFIG.storageBucket)
        .createSignedUrl(storagePath, STORAGE_CONFIG.signedUrlExpiry);

      if (error || !data?.signedUrl) {
        const { infoLog } = await import('@/lib/log');
        infoLog('[Process] Error generating signed URL:', error);
        return '';
      }

      return data.signedUrl;
    } catch (error) {
      const { infoLog } = await import('@/lib/log');
      infoLog('[Process] Exception in generateSignedUrl:', error);
      return '';
    }
  }

  /**
   * Save OCR result to the database
   */
  private async saveOCRResult(result: OCRResult, status: ProcessingStatus): Promise<boolean> {
    try {
      const { db } = await import('@/lib/database');
      const { infoLog } = await import('@/lib/log');
      infoLog('Attempting to save results for document ID:', status.id);

      // Ensure critical fields are set
      if (!result.documentId) {
        result.documentId = status.id;
      }

      // Make sure user_id is always present
      if (!result.user_id && status.user_id) {
        result.user_id = status.user_id;
        infoLog(`Setting user_id from status: ${status.user_id}`);
      }

      // Double-check we have a user_id before saving
      if (!result.user_id) {
        infoLog('WARNING: No user_id available for OCR result. Attempting to get from document...');

        try {
          // First try to get user ID from the document
          const { serverAuthHelper } = await import('@/lib/server-auth-helper');
          const user = await serverAuthHelper.getUserByDocumentId(status.id);
          if (user?.id) {
            result.user_id = user.id;
            infoLog(`Retrieved user_id from document via server auth helper: ${user.id}`);
          } else {
            // If that fails, try the regular auth method
            const { getUser } = await import('@/lib/auth');
            const authUser = await getUser();
            if (authUser?.id) {
              result.user_id = authUser.id;
              infoLog(`Retrieved user_id from auth: ${authUser.id}`);
            }
          }
        } catch (userError) {
          infoLog('Could not retrieve user from any source in saveOCRResult');
        }

        // If still no user_id, this is a critical error
        if (!result.user_id) {
          infoLog('ERROR: Cannot save OCR result without user_id');
          return false;
        }
      }

      await db.saveResults(status.id, [result]);
      infoLog(`Successfully saved result for documentId: ${status.id}, userId: ${result.user_id}`);
      return true;
    } catch (error) {
      console.error('Error saving OCR result:', error);
      return false;
    }
  }

  /**
   * Process a single image and return OCR result
   */
  private async processImage(base64: string, documentId: string, userId: string, path: string, signal: AbortSignal, options?: {
    pageNumber?: number;
    totalPages?: number;
  }): Promise<OCRResult> {
    try {
      const { infoLog } = await import('@/lib/log');

      // Validate and clean the base64 data
      const { validateAndCleanBase64 } = await import('@/lib/file-utils');
      const cleanBase64 = validateAndCleanBase64(base64);

      if (!cleanBase64) {
        infoLog(`[OCR] Error: Invalid base64 data for image`);
        throw new Error(`Invalid base64 data for image`);
      }

      // Generate unique ID for the result
      const resultId = crypto.randomUUID();

      // Generate signed URL for the image
      const imageUrl = await this.generateSignedUrl(path, userId);
      infoLog(`Generated signed URL for image: ${imageUrl.substring(0, 50)}...`);

      // Process the image with OCR
      const pageNumber = options?.pageNumber || 1;
      const totalPages = options?.totalPages || 1;
      infoLog(`[OCR] Using ${this.ocrProvider.constructor.name} to process image for page ${pageNumber}/${totalPages}, data length: ${cleanBase64.length}`);

      // Pass the page number and total pages to the OCR provider
      const result = await this.ocrProvider.processImage(
        cleanBase64,
        signal,
        'image/jpeg', // fileType for image processing
        pageNumber,
        totalPages
      );

      // Ensure text field is set (never null)
      if (result.text === null || result.text === undefined) {
        infoLog(`[OCR] Warning: OCR result text is null or undefined. Setting to empty string.`);
        result.text = '';
      }

      // Set additional fields
      result.id = resultId;
      result.documentId = documentId;
      result.user_id = userId; // Use snake_case for database compatibility
      result.pageNumber = options?.pageNumber || 1;
      result.totalPages = options?.totalPages || 1;
      result.storagePath = path;

      // Set both camelCase and snake_case versions of the image URL field
      // This ensures compatibility with both code and database expectations
      result.imageUrl = imageUrl;
      result.image_url = imageUrl; // Add snake_case version for database compatibility

      return result;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }
}