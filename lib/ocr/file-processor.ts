import type { OCRResult, ProcessingStatus } from "@/types";
import type { ProcessingSettings } from "@/types/settings";
import { renderPageToBase64, loadPDF } from "../pdf-utils";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OCRProvider } from "./providers/types";
import { MistralOCRProvider } from "./providers/mistral";

export class FileProcessor {
  private processingSettings: ProcessingSettings;
  private ocrProvider: OCRProvider;

  constructor(processingSettings: ProcessingSettings, ocrProvider: OCRProvider) {
    this.processingSettings = processingSettings;
    this.ocrProvider = ocrProvider;
  }

  async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    if (!status.file) throw new Error("No file to process");
    console.log(`[Process] Starting ${status.filename}`);

    // For images
    if (status.file.type.startsWith("image/")) {
      const base64 = await this.fileToBase64(status.file);

      // Check if cancelled
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for ${status.filename}`);
        throw new Error("Processing aborted");
      }

      console.log(`[Process] Processing image: ${status.filename}`);
      const result = await this.ocrProvider.processImage(base64, signal);
      result.documentId = status.id;
      result.imageUrl = `data:${status.file.type};base64,${base64}`;
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

              // Process PDF directly
              console.log(`[Process] Sending PDF to Mistral OCR API`);
              const result = await this.ocrProvider.processPdfDirectly(base64Data, signal);
              result.documentId = status.id;
              result.totalPages = numPages;

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
    try {
      const page = await pdf.getPage(pageNum);
      const base64Data = await renderPageToBase64(page);

      // Check if cancelled
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for page ${pageNum} of ${status.filename}`);
        throw new Error("Processing aborted");
      }

      console.log(`[Process] Processing page ${pageNum} of ${status.filename}`);
      status.currentPage = pageNum;

      // Pass the page number and total pages to the OCR provider
      const result = await this.ocrProvider.processImage(
        base64Data,
        signal,
        undefined, // fileType
        pageNum,   // pageNumber
        status.totalPages // totalPages
      );

      // Use JPEG instead of PNG for better compression
      result.imageUrl = `data:image/jpeg;base64,${base64Data}`;

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
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64.split(",")[1]);
      };
      reader.onerror = (error) => {
        console.error(`[Process] Error reading file:`, error);
        reject(new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`));
      };
      reader.readAsDataURL(file);
    });
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
}