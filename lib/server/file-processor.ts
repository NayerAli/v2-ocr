import type { OCRResult, ProcessingStatus } from "@/types";
import type { ProcessingSettings } from "@/types/settings";
import { renderPageToBase64, loadPDFFromBuffer } from "./pdf-utils";
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
        
        // Load PDF document
        const pdf = await loadPDFFromBuffer(buffer);
        const numPages = pdf.numPages;
        console.log(`[Process] Successfully loaded PDF with ${numPages} pages`);
        
        // Only attempt direct PDF processing with Mistral provider
        if (this.ocrProvider instanceof MistralOCRProvider) {
          // Check if we can process directly
          if (this.ocrProvider.canProcessPdfDirectly(fileSize, numPages)) {
            console.log(`[Process] PDF is within Mistral limits (${numPages} pages, ${Math.round(fileSizeMB)}MB). Processing directly.`);
            
            try {
              // Process PDF directly
              console.log(`[Process] Sending PDF to Mistral OCR API`);
              const result = await this.ocrProvider.processPdfDirectly(buffer.toString('base64'), signal);
              result.documentId = documentId;
              result.totalPages = numPages;
              
              console.log(`[Process] Completed PDF direct processing: ${filename}`);
              return [result];
            } catch (error) {
              // If direct processing fails, fall back to page-by-page processing
              console.error(`[Process] Error in direct PDF processing:`, error);
              console.log(`[Process] Falling back to page-by-page processing`);
              return this.processPageByPage(pdf, documentId, numPages, filename, signal);
            }
          } else {
            console.log(`[Process] PDF exceeds Mistral limits. Processing page by page.`);
            return this.processPageByPage(pdf, documentId, numPages, filename, signal);
          }
        } else {
          // For non-Mistral providers, always process page by page
          console.log(`[Process] Using non-Mistral provider. Processing PDF page by page.`);
          return this.processPageByPage(pdf, documentId, numPages, filename, signal);
        }
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

  private async processPage(
    pdf: PDFDocumentProxy,
    pageNum: number,
    documentId: string,
    totalPages: number,
    filename: string,
    signal: AbortSignal
  ): Promise<OCRResult> {
    try {
      const page = await pdf.getPage(pageNum);
      const base64Data = await renderPageToBase64(pdf, pageNum);
      
      // Check if cancelled
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for page ${pageNum} of ${filename}`);
        throw new Error("Processing aborted");
      }
      
      console.log(`[Process] Processing page ${pageNum} of ${filename}`);
      
      // Pass the page number and total pages to the OCR provider
      const result = await this.ocrProvider.processImage(
        base64Data, 
        signal, 
        undefined, // fileType
        pageNum,   // pageNumber
        totalPages // totalPages
      );
      
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
      
      console.log(`[Process] Completed page ${pageNum}`);
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