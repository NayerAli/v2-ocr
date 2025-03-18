import type { OCRResult, ProcessingStatus } from "@/types";
import type { ProcessingSettings } from "@/types/settings";
import { renderPageToBase64, loadPDFFromBuffer, extractPagesAsBase64 } from "./pdf-utils";
import type { OCRProvider } from "../ocr/providers/types";
import { MistralOCRProvider } from "../ocr/providers/mistral";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import crypto from "crypto";

export class FileProcessor {
  private processingSettings: ProcessingSettings;
  private ocrProvider: OCRProvider;

  constructor(processingSettings: ProcessingSettings, ocrProvider: OCRProvider) {
    this.processingSettings = processingSettings;
    this.ocrProvider = ocrProvider;
  }

  async processFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    documentId: string,
    signal: AbortSignal
  ): Promise<OCRResult[]> {
    console.log(`[Process] Starting ${filename}`);

    // For images
    if (mimeType.startsWith("image/")) {
      const base64 = buffer.toString('base64');
      
      // Check if cancelled
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for ${filename}`);
        throw new Error("Processing aborted");
      }

      console.log(`[Process] Processing image: ${filename}`);
      const result = await this.ocrProvider.processImage(base64, signal);
      
      // Ensure result has an ID
      result.id = crypto.randomUUID();
      result.documentId = documentId;
      result.imageUrl = `data:${mimeType};base64,${base64}`;
      console.log(`[Process] Completed image: ${filename}`);
      return [result];
    }

    // For PDFs
    if (mimeType === "application/pdf") {
      try {
        console.log(`[Process] Processing PDF: ${filename}`);
        const fileSize = buffer.length;
        const fileSizeMB = fileSize / (1024 * 1024);
        console.log(`[Process] PDF file size: ${Math.round(fileSizeMB * 100) / 100}MB`);
        
        // Check if file is empty
        if (fileSize === 0) {
          throw new Error("PDF file is empty");
        }
        
        // Try to load PDF document with enhanced diagnostics
        console.log(`[Process] Loading PDF document: ${filename} (${Math.round(fileSizeMB * 100) / 100}MB)`);
        
        // Check if Mistral provider can process PDF directly
        if (this.ocrProvider instanceof MistralOCRProvider && 
            this.ocrProvider.canProcessPdfDirectly(fileSize, 0)) {
          try {
            console.log(`[Process] Attempting to process PDF directly with Mistral OCR API`);
            const result = await this.ocrProvider.processPdfDirectly(buffer.toString('base64'), signal);
            result.documentId = documentId;
            
            console.log(`[Process] Completed PDF direct processing: ${filename}`);
            return [result];
          } catch (directError) {
            console.error(`[Process] Error in direct PDF processing:`, directError);
            console.log(`[Process] Falling back to page-by-page processing`);
            // Continue with page-by-page processing
          }
        }
        
        // Extract pages using our more reliable method
        console.log(`[Process] Extracting pages from PDF using reliable method`);
        const extracted = await extractPagesAsBase64(buffer);
        
        console.log(`[Process] Successfully extracted ${extracted.pages.length} pages from PDF`);
        
        // Process each page with OCR
        const results: OCRResult[] = [];
        const totalPages = extracted.numPages;
        
        // Process in chunks to avoid memory issues
        const pagesPerChunk = this.processingSettings.pagesPerChunk;
        const chunks = Math.ceil(totalPages / pagesPerChunk);
        
        for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
          if (signal.aborted) {
            console.log(`[Process] Processing aborted for ${filename}`);
            throw new Error("Processing aborted");
          }
          
          const startPage = chunkIndex * pagesPerChunk + 1;
          const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, totalPages);
          console.log(`[Process] Processing chunk ${chunkIndex + 1}/${chunks} (pages ${startPage}-${endPage})`);
          
          const chunkPromises: Promise<OCRResult>[] = [];
          
          for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            if (signal.aborted) {
              console.log(`[Process] Processing aborted for ${filename}`);
              throw new Error("Processing aborted");
            }
            
            const pageIndex = pageNum - 1;
            if (pageIndex >= 0 && pageIndex < extracted.pages.length) {
              const base64Data = extracted.pages[pageIndex];
              
              // Create a promise for processing this page
              const processPromise = (async () => {
                try {
                  console.log(`[Process] Processing page ${pageNum}/${totalPages} with OCR`);
                  
                  // Send to OCR service
                  const result = await this.ocrProvider.processImage(
                    base64Data,
                    signal,
                    undefined, // fileType
                    pageNum,   // pageNumber
                    totalPages // totalPages
                  );
                  
                  // Ensure result has an ID and other required fields
                  result.id = crypto.randomUUID();
                  result.imageUrl = `data:image/png;base64,${base64Data}`;
                  result.documentId = documentId;
                  result.pageNumber = pageNum;
                  result.totalPages = totalPages;
                  
                  console.log(`[Process] Successfully processed page ${pageNum}/${totalPages}`);
                  return result;
                } catch (error) {
                  console.error(`[Process] Error processing page ${pageNum}:`, error);
                  
                  // Create an error result
                  const errorResult: OCRResult = {
                    id: crypto.randomUUID(),
                    documentId,
                    text: `Error processing page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`,
                    confidence: 0,
                    language: "unknown",
                    processingTime: 0,
                    pageNumber: pageNum,
                    totalPages,
                    error: error instanceof Error ? error.message : String(error),
                    imageUrl: `data:image/png;base64,${base64Data}`
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
                  }
                  
                  return errorResult;
                }
              })();
              
              chunkPromises.push(processPromise);
            }
          }
          
          // Process pages in parallel within the chunk
          const maxConcurrentChunks = this.processingSettings.concurrentChunks;
          const chunkResults = await this.processInBatches(chunkPromises, maxConcurrentChunks);
          results.push(...chunkResults);
        }
        
        console.log(`[Process] Completed PDF: ${filename} with ${results.length} pages`);
        return results;
      } catch (error) {
        console.error(`[Process] Error processing PDF: ${error}`);
        throw error;
      }
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  
  private async processPageByPage(
    pdf: PDFDocumentProxy,
    documentId: string,
    totalPages: number,
    filename: string,
    signal: AbortSignal
  ): Promise<OCRResult[]> {
    console.log(`[Process] PDF has ${totalPages} pages`);
    const results: OCRResult[] = [];

    // Process in chunks to avoid memory issues
    const pagesPerChunk = this.processingSettings.pagesPerChunk;
    const chunks = Math.ceil(totalPages / pagesPerChunk);

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for ${filename}`);
        throw new Error("Processing aborted");
      }

      const startPage = chunkIndex * pagesPerChunk + 1;
      const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, totalPages);
      console.log(`[Process] Processing chunk ${chunkIndex + 1}/${chunks} (pages ${startPage}-${endPage})`);

      const chunkPromises: Promise<OCRResult>[] = [];
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        if (signal.aborted) {
          console.log(`[Process] Processing aborted for ${filename}`);
          throw new Error("Processing aborted");
        }
        chunkPromises.push(this.processPage(pdf, pageNum, documentId, totalPages, filename, signal));
      }

      // Process pages in parallel within the chunk
      const maxConcurrentChunks = this.processingSettings.concurrentChunks;
      const chunkResults = await this.processInBatches(chunkPromises, maxConcurrentChunks);
      results.push(...chunkResults);
    }

    console.log(`[Process] Completed PDF: ${filename}`);
    return results;
  }

  // Changed to public so it can be patched by the processing service
  public async processPage(
    pdf: PDFDocumentProxy,
    pageNum: number,
    documentId: string,
    totalPages: number,
    filename: string,
    signal: AbortSignal
  ): Promise<OCRResult> {
    try {
      console.log(`[Process] Processing page ${pageNum}/${totalPages} of ${filename}`);
      
      // Try to get the page with timeout
      let page;
      console.log(`[Process] Getting page ${pageNum} from PDF...`);
      try {
        const pagePromise = pdf.getPage(pageNum);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout getting page ${pageNum}`)), 30000);
        });
        
        page = await Promise.race([pagePromise, timeoutPromise]);
        console.log(`[Process] Successfully got page ${pageNum}`);
      } catch (pageError) {
        console.error(`[Process] Error getting page ${pageNum}:`, pageError);
        throw new Error(`Failed to get page ${pageNum}: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
      }
      
      // Check if cancelled
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for page ${pageNum} of ${filename}`);
        throw new Error("Processing aborted");
      }
      
      // Convert page to base64
      console.log(`[Process] Converting page ${pageNum} to base64`);
      let base64Data;
      try {
        base64Data = await renderPageToBase64(pdf, pageNum);
        console.log(`[Process] Successfully converted page ${pageNum} to base64 (${Math.round(base64Data.length / 1024)}KB)`);
      } catch (renderError) {
        console.error(`[Process] Error rendering page ${pageNum} to base64:`, renderError);
        throw new Error(`Failed to render page ${pageNum} to base64: ${renderError instanceof Error ? renderError.message : String(renderError)}`);
      }
      
      // Check if cancelled
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for page ${pageNum} of ${filename}`);
        throw new Error("Processing aborted");
      }
      
      // Send to OCR service
      console.log(`[Process] Sending page ${pageNum} to OCR service`);
      let result;
      try {
        result = await this.ocrProvider.processImage(
          base64Data, 
          signal, 
          undefined, // fileType
          pageNum,   // pageNumber
          totalPages // totalPages
        );
        console.log(`[Process] Successfully processed page ${pageNum} with OCR`);
      } catch (ocrError) {
        console.error(`[Process] Error in OCR processing for page ${pageNum}:`, ocrError);
        throw new Error(`OCR processing failed for page ${pageNum}: ${ocrError instanceof Error ? ocrError.message : String(ocrError)}`);
      }
      
      // Ensure result has an ID
      result.id = crypto.randomUUID();
      result.imageUrl = `data:image/png;base64,${base64Data}`;
      result.documentId = documentId;
      result.pageNumber = pageNum;
      result.totalPages = totalPages;
      
      // Check if we got a rate limit response
      if (result.rateLimitInfo?.isRateLimited) {
        console.log(`[Process] Rate limited on page ${pageNum} of ${filename}. Retry after ${result.rateLimitInfo.retryAfter}s`);
      }
      
      console.log(`[Process] Completed page ${pageNum}/${totalPages}`);
      return result;
    } catch (error) {
      console.error(`[Process] Error processing page ${pageNum} of ${filename}:`, error);
      
      // Create an error result
      const errorResult: OCRResult = {
        id: crypto.randomUUID(),
        documentId,
        text: `Error processing page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
        language: "unknown",
        processingTime: 0,
        pageNumber: pageNum,
        totalPages,
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