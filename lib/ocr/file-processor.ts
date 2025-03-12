import type { OCRResult, ProcessingStatus } from "@/types";
import type { ProcessingSettings } from "@/types/settings";
import { renderPageToBase64 } from "../pdf-utils";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getDocument } from "pdfjs-dist";
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
        
        // Get array buffer and load PDF to get page count
        const arrayBuffer = await status.file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
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

    // Process in chunks to avoid memory issues
    const pagesPerChunk = this.processingSettings.pagesPerChunk;
    const chunks = Math.ceil(numPages / pagesPerChunk);

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      if (signal.aborted) {
        console.log(`[Process] Processing aborted for ${status.filename}`);
        throw new Error("Processing aborted");
      }

      const startPage = chunkIndex * pagesPerChunk + 1;
      const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, numPages);
      console.log(`[Process] Processing chunk ${chunkIndex + 1}/${chunks} (pages ${startPage}-${endPage})`);

      const chunkPromises: Promise<OCRResult>[] = [];
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        if (signal.aborted) {
          console.log(`[Process] Processing aborted for ${status.filename}`);
          throw new Error("Processing aborted");
        }
        chunkPromises.push(this.processPage(pdf, pageNum, status, signal));
      }

      // Process pages in parallel within the chunk
      const maxConcurrentChunks = this.processingSettings.concurrentChunks;
      const chunkResults = await this.processInBatches(chunkPromises, maxConcurrentChunks);
      
      // Add document ID and page number to each result
      for (let i = 0; i < chunkResults.length; i++) {
        const pageNum = startPage + i;
        chunkResults[i].documentId = status.id;
        chunkResults[i].pageNumber = pageNum;
        chunkResults[i].totalPages = numPages;
      }
      
      results.push(...chunkResults);
      
      // Update progress after each chunk
      status.progress = Math.floor((endPage / numPages) * 100);
      console.log(`[Process] Progress: ${status.progress}% (${endPage}/${numPages} pages)`);
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
      
      result.imageUrl = `data:image/png;base64,${base64Data}`;
      
      // Check if we got a rate limit response
      if (result.rateLimitInfo?.isRateLimited) {
        console.log(`[Process] Rate limited on page ${pageNum} of ${status.filename}. Retry after ${result.rateLimitInfo.retryAfter}s`);
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