import type { OCRResult, ProcessingStatus } from "@/types";
import type { ProcessingSettings } from "@/types/settings";
import { renderPageToBase64, loadPDF } from "../pdf-utils";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OCRProvider } from "./providers/types";
import { MistralOCRProvider } from "./providers/mistral";
import { getUser } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase/singleton-client";

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

  constructor(processingSettings: ProcessingSettings, ocrProvider: OCRProvider) {
    this.processingSettings = processingSettings;
    this.ocrProvider = ocrProvider;
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
  hasValidOCRProvider(): boolean {
    // Check if the OCR provider has a valid API key
    if (!this.ocrProvider) {
      console.log('[DEBUG] No OCR provider available');
      return false;
    }

    // Check if the provider has an API key
    // We need to access the settings property which might be private
    // @ts-expect-error - Accessing private property for debugging
    const apiKey = this.ocrProvider.settings?.apiKey;
    // @ts-expect-error - Accessing private property for debugging
    const useSystemKey = this.ocrProvider.settings?.useSystemKey;

    // Simplified check: if there's an API key with length > 0, it's valid
    const isValid = !!apiKey && apiKey.length > 0;

    console.log('[DEBUG] OCR provider API key check:', {
      isValid,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      useSystemKey: !!useSystemKey
    });

    return isValid;
  }

  async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    const supabase = getSupabaseClient();
    if (!status.file) throw new Error("No file to process");
    console.log(`[Process] Starting ${status.filename}`);

    // Verify we have a valid OCR provider before processing
    if (!this.hasValidOCRProvider()) {
      console.error(`[Process] No valid OCR provider available for processing ${status.filename}`);
      throw new Error("No valid OCR provider available");
    }

    // For images
    if (status.file.type.startsWith("image/")) {
      const base64 = await this.fileToBase64(status.file);
      if (signal.aborted) throw new Error("Processing aborted");
      console.log(`[Process] Processing image: ${status.filename}`);
      const user = await getUser();
      if (!user) throw new Error("User not authenticated");

      const path = `${user.id}/${status.id}/migrated_1${this.getExtensionForMime(status.file.type)}`;
      console.log(`[Process] Uploading image to ${path}`);
      const { error: uploadError } = await supabase
        .storage
        .from(STORAGE_CONFIG.storageBucket)
        .upload(path, status.file, { upsert: true });

      if (uploadError) {
        console.error(`[Process] Error uploading image to storage:`, uploadError);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      // Generate a signed URL for the image
      const imageUrl = await this.generateSignedUrl(path);
      console.log(`[Process] Generated signed URL for image: ${imageUrl.substring(0, 50)}...`);

      // Process the image with OCR
      const result = await this.ocrProvider.processImage(base64, signal);
      result.documentId = status.id;
      result.storagePath = path;
      result.imageUrl = imageUrl; // Use the signed URL instead of base64
      console.log(`[Process] Completed image: ${status.filename}`);
      return [result];
    }

    // For PDFs
    if (status.file.type === "application/pdf") {
      try {
        console.log(`[Process] Processing PDF: ${status.filename}`);
        const fileSize = status.file.size;
        const fileSizeMB = fileSize / (1024 * 1024);
        console.log(`[Process] PDF file size: ${Math.round(fileSizeMB * 100) / 100}MB`);

        // Check if file is empty
        if (fileSize === 0) {
          throw new Error("PDF file is empty");
        }

        // Load PDF using our optimized loading function
        console.log(`[Process] Loading PDF file...`);
        const pdf = await loadPDF(status.file);
        const numPages = pdf.numPages;
        status.totalPages = numPages;
        console.log(`[Process] Successfully loaded PDF with ${numPages} pages`);

        // Only attempt direct PDF processing with Mistral provider
        if (this.ocrProvider instanceof MistralOCRProvider) {
          // Check if we can process directly
          if (this.ocrProvider.canProcessPdfDirectly(fileSize, numPages)) {
            console.log(`[Process] PDF is within Mistral limits (${numPages} pages, ${Math.round(fileSizeMB)}MB). Processing directly.`);

            try {
              // Convert PDF to base64
              const base64Data = await this.fileToBase64(status.file);
              console.log(`[Process] Successfully converted PDF to base64`);

              // Check if cancelled
              if (signal.aborted) {
                console.log(`[Process] Processing aborted for ${status.filename}`);
                throw new Error("Processing aborted");
              }

              // Get the current user
              const user = await getUser();
              if (!user) {
                throw new Error("User not authenticated");
              }

              // Upload the original PDF
              const path = `${user.id}/${status.id}/migrated_1.pdf`;
              console.log(`[Process] Uploading original PDF to ${path}`);

              const { error: uploadError } = await supabase
                .storage
                .from(STORAGE_CONFIG.storageBucket)
                .upload(path, status.file, { upsert: true });

              if (uploadError) {
                console.error(`[Process] Error uploading PDF to storage:`, uploadError);
                throw new Error(`Failed to upload PDF: ${uploadError.message}`);
              }

              // Generate a signed URL for the PDF
              const pdfUrl = await this.generateSignedUrl(path);

              // Process PDF directly
              console.log(`[Process] Sending PDF to Mistral OCR API`);
              const result = await this.ocrProvider.processPdfDirectly(base64Data, signal);
              result.documentId = status.id;
              result.totalPages = numPages;
              result.storagePath = path;
              result.imageUrl = pdfUrl; // Use the signed URL instead of base64
              console.log(`[Process] Generated signed URL for PDF: ${pdfUrl.substring(0, 50)}...`);

              console.log(`[Process] Completed PDF direct processing: ${status.filename}`);
              return [result];
            } catch (error) {
              // If direct processing fails, fall back to page-by-page processing
              console.error(`[Process] Error in direct PDF processing:`, error);
              console.log(`[Process] Falling back to page-by-page processing`);
              return this.processPageByPage(pdf, status, signal);
            }
          } else {
            console.log(`[Process] PDF exceeds Mistral limits. Processing page by page.`);
            return this.processPageByPage(pdf, status, signal);
          }
        } else {
          // For non-Mistral providers, always process page by page
          console.log(`[Process] Using non-Mistral provider. Processing PDF page by page.`);
          return this.processPageByPage(pdf, status, signal);
        }
      } catch (error) {
        console.error(`[Process] Error processing PDF: ${error}`);
        throw error;
      }
    }

    throw new Error(`Unsupported file type: ${status.file.type}`);
  }

  private async processPageByPage(pdf: PDFDocumentProxy, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    // We don't need supabase here, it's used in processPage
    const numPages = pdf.numPages;
    console.log(`[Process] PDF has ${numPages} pages`);
    const results: OCRResult[] = [];

    // Adjust chunk size based on PDF size and page count
    let pagesPerChunk = this.processingSettings.pagesPerChunk;
    const isLargePDF = numPages > 100;

    // For very large PDFs, reduce the chunk size to avoid memory issues
    if (isLargePDF) {
      // Adjust chunk size based on page count
      if (numPages > 500) {
        pagesPerChunk = Math.min(pagesPerChunk, 5); // Very large PDFs: max 5 pages per chunk
        console.log(`[Process] Very large PDF detected (${numPages} pages). Reducing chunk size to ${pagesPerChunk} pages.`);
      } else if (numPages > 200) {
        pagesPerChunk = Math.min(pagesPerChunk, 8); // Large PDFs: max 8 pages per chunk
        console.log(`[Process] Large PDF detected (${numPages} pages). Reducing chunk size to ${pagesPerChunk} pages.`);
      }
    }

    const chunks = Math.ceil(numPages / pagesPerChunk);
    console.log(`[Process] Processing PDF in ${chunks} chunks of ${pagesPerChunk} pages each`);

    // For large PDFs, save results after each chunk to avoid memory issues
    const saveAfterEachChunk = isLargePDF;
    if (saveAfterEachChunk) {
      console.log(`[Process] Large PDF detected. Results will be saved after each chunk.`);
    }

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for ${status.filename}`);
        throw new Error("Processing aborted");
      }

      const startPage = chunkIndex * pagesPerChunk + 1;
      const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, numPages);
      console.log(`[Process] Processing chunk ${chunkIndex + 1}/${chunks} (pages ${startPage}-${endPage})`);

      try {
        // Process pages in smaller batches for better memory management
        const maxPagesPerBatch = Math.min(pagesPerChunk, 3); // Process max 3 pages at a time
        const batchCount = Math.ceil((endPage - startPage + 1) / maxPagesPerBatch);

        const chunkResults: OCRResult[] = [];

        for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
          const batchStartPage = startPage + batchIndex * maxPagesPerBatch;
          const batchEndPage = Math.min(startPage + (batchIndex + 1) * maxPagesPerBatch - 1, endPage);

          console.log(`[Process] Processing batch ${batchIndex + 1}/${batchCount} (pages ${batchStartPage}-${batchEndPage})`);

          const batchPromises: Promise<OCRResult>[] = [];
          for (let pageNum = batchStartPage; pageNum <= batchEndPage; pageNum++) {
            if (signal.aborted) {
              console.log(`[Process] Processing aborted for ${status.filename}`);
              throw new Error("Processing aborted");
            }
            batchPromises.push(this.processPage(pdf, pageNum, status, signal));
          }

          // Process pages in parallel within the batch
          const maxConcurrentPages = Math.min(this.processingSettings.concurrentChunks, 2); // Limit concurrent processing
          const batchResults = await this.processInBatches(batchPromises, maxConcurrentPages);

          // Add document ID and page number to each result
          for (let i = 0; i < batchResults.length; i++) {
            const pageNum = batchStartPage + i;
            batchResults[i].documentId = status.id;
            batchResults[i].pageNumber = pageNum;
            batchResults[i].totalPages = numPages;
          }

          chunkResults.push(...batchResults);

          // Force garbage collection after each batch if available
          if (typeof window !== 'undefined' && window.gc) {
            try {
              window.gc();
            } catch {
              // Ignore if gc is not available
            }
          }

          // Update progress after each batch
          status.progress = Math.floor((batchEndPage / numPages) * 100);
          status.currentPage = batchEndPage;
          console.log(`[Process] Progress: ${status.progress}% (${batchEndPage}/${numPages} pages)`);
        }

        // Save results after each chunk for large PDFs
        if (saveAfterEachChunk) {
          // This will be handled by the queue manager
          console.log(`[Process] Saving chunk ${chunkIndex + 1} results (${chunkResults.length} pages)`);
        }

        results.push(...chunkResults);
      } catch (error) {
        console.error(`[Process] Error processing chunk ${chunkIndex + 1}: ${error}`);
        // Continue with next chunk instead of failing the entire process
        if (!signal.aborted) {
          console.log(`[Process] Continuing with next chunk...`);
          continue;
        } else {
          throw error;
        }
      }

      // Update progress after each chunk
      status.progress = Math.floor((endPage / numPages) * 100);
      status.currentPage = endPage;
      console.log(`[Process] Progress: ${status.progress}% (${endPage}/${numPages} pages)`);
    }

    // Clean up resources
    try {
      // Close the PDF document to free up resources
      if (pdf && typeof pdf.destroy === 'function') {
        await pdf.destroy();
      }
    } catch (error) {
      console.warn(`[Process] Error cleaning up PDF resources: ${error}`);
      // Continue even if cleanup fails
    }

    console.log(`[Process] Completed PDF: ${status.filename}`);
    return results;
  }

  private async processPage(pdf: PDFDocumentProxy, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
    const supabase = getSupabaseClient();
    try {
      const page = await pdf.getPage(pageNum);
      const base64Data = await renderPageToBase64(page);
      if (signal.aborted) throw new Error("Processing aborted");
      console.log(`[Process] Processing page ${pageNum} of ${status.filename}`);
      status.currentPage = pageNum;

      const user = await getUser();
      if (!user) throw new Error("User not authenticated");

      const blob = await this.base64ToBlob(base64Data, 'image/jpeg');
      const path = `${user.id}/${status.id}/page_${pageNum}.jpg`;
      let uploadSuccessful = false;

      try {
          console.log(`[Process] Uploading page ${pageNum} to ${path}`);
          const { error: uploadError } = await supabase
            .storage
            .from(STORAGE_CONFIG.storageBucket)
            .upload(path, blob, { upsert: true });

          if (uploadError) {
            console.error(`[Process] Error uploading page ${pageNum} to storage:`, uploadError);
            // Do not throw here, let OCR proceed but mark upload as failed
          } else {
            uploadSuccessful = true;
            console.log(`[Process] Successfully uploaded page ${pageNum} to ${path}`);
          }
      } catch (uploadCatchError) {
          console.error(`[Process] Exception during upload for page ${pageNum}:`, uploadCatchError);
          // Mark upload as failed
      }

      const result = await this.ocrProvider.processImage(
        base64Data,
        signal,
        undefined,
        pageNum,
        status.totalPages
      );

      // IMPORTANT: Only set storagePath and generate URL if upload was successful
      if (uploadSuccessful) {
        result.storagePath = path;

        // Generate a signed URL for the page image
        try {
          const imageUrl = await this.generateSignedUrl(path);
          console.log(`[Process] Generated signed URL for page ${pageNum}: ${imageUrl.substring(0, 50)}...`);
          result.imageUrl = imageUrl; // Use the signed URL instead of base64
        } catch (urlError) {
          console.error(`[Process] Error generating signed URL for page ${pageNum}:`, urlError);
        }
      } else {
        result.storagePath = undefined; // Ensure path is not set if upload failed
        console.warn(`[Process] storagePath not set for page ${pageNum} due to upload failure.`);
      }

      // Check if we got a rate limit response
      if (result.rateLimitInfo?.isRateLimited) {
        console.log(`[Process] Rate limited on page ${pageNum} of ${status.filename}. Retry after ${result.rateLimitInfo.retryAfter}s`);
      }

      // Clean up page resources
      try {
        if (page && typeof page.cleanup === 'function') {
          page.cleanup();
        }
      } catch {
        // Ignore cleanup errors
      }

      console.log(`[Process] Completed page ${pageNum}`);
      return result;
    } catch (error) {
      console.error(`[Process] Error processing page ${pageNum} of ${status.filename}:`, error);

      // Create an error result
      const errorResult: OCRResult = {
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

      // Check if it's a rate limit error
      if (error instanceof Error &&
          (error.message.includes("429") || error.message.toLowerCase().includes("rate limit"))) {
        // Extract retry time if available
        const retryMatch = error.message.match(/retry after (\d+)/i);
        const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : 60; // Default to 60s

        errorResult.rateLimitInfo = {
          isRateLimited: true,
          retryAfter,
          retryAt: new Date(Date.now() + (retryAfter * 1000)).toISOString()
        };

        console.log(`[Process] Rate limit error on page ${pageNum}. Retry after ${retryAfter}s`);
      }

      return errorResult;
    }
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = (error) => reject(new Error(`Failed to read file: ${error}`));
      reader.readAsDataURL(file);
    });
  }

  private async base64ToBlob(base64: string, contentType: string = ''): Promise<Blob> {
    return fetch(`data:${contentType};base64,${base64}`).then(res => res.blob());
  }

  private async processInBatches<T>(promises: Promise<T>[], batchSize: number): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private getExtensionForMime(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/gif':
        return '.gif';
      default:
        throw new Error(`Unsupported image MIME type: ${mimeType}`);
    }
  }

  /**
   * Generate a signed URL for a file in Supabase storage
   */
  private async generateSignedUrl(storagePath: string): Promise<string> {
    try {
      const supabase = getSupabaseClient();
      const user = await getUser();

      if (!user) {
        console.error('[Process] User not authenticated. Cannot generate signed URL.');
        return '';
      }

      // Create a signed URL that expires in the configured time
      const { data, error } = await supabase.storage
        .from(STORAGE_CONFIG.storageBucket)
        .createSignedUrl(storagePath, STORAGE_CONFIG.signedUrlExpiry);

      if (error || !data?.signedUrl) {
        console.error('[Process] Error generating signed URL:', error);
        return '';
      }

      return data.signedUrl;
    } catch (error) {
      console.error('[Process] Exception in generateSignedUrl:', error);
      return '';
    }
  }
}