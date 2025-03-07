import type { ProcessingStatus, OCRResult } from "@/types"
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings"
import { db } from "./indexed-db"
import { renderPageToBase64 } from "./pdf-utils"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { getDocument } from "pdfjs-dist"

class AzureRateLimiter {
  private isRateLimited: boolean = false;
  private rateLimitEndTime: number = 0;

  constructor() {
    console.log('[Azure] Service initialized');
  }

  async waitIfLimited(): Promise<void> {
    if (this.isRateLimited) {
      const waitTime = this.rateLimitEndTime - Date.now();
      if (waitTime > 0) {
        const remainingSeconds = Math.ceil(waitTime/1000);
        console.log(`[Azure] Rate limited - Waiting ${remainingSeconds}s before resuming`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      console.log('[Azure] Rate limit period ended - Resuming processing');
      this.isRateLimited = false;
    }
  }

  setRateLimit(retryAfter: number) {
    this.isRateLimited = true;
    this.rateLimitEndTime = Date.now() + (retryAfter * 1000);
    console.log(`[Azure] Rate limit encountered - Must wait ${retryAfter}s`);
  }
}

interface MicrosoftVisionRegion {
  lines: Array<{
    words: Array<{
      text: string
    }>
  }>
}

interface MicrosoftVisionResponse {
  language?: string
  regions?: MicrosoftVisionRegion[]
}

// Add interface for Mistral OCR response
interface MistralOCRPage {
  markdown?: string;
  text?: string;
  index?: number;
  images?: Array<{
    data?: string;
    type?: string;
  }>;
  dimensions?: {
    dpi?: number;
    height?: number;
    width?: number;
  };
}

interface MistralOCRResponse {
  pages?: MistralOCRPage[];
  text?: string;
}

export class ProcessingService {
  private static instance: ProcessingService | null = null
  private queueMap: Map<string, ProcessingStatus> = new Map()
  private isProcessing = false
  private isPaused = false
  private ocrSettings: OCRSettings
  private processingSettings: ProcessingSettings
  private uploadSettings: UploadSettings
  private abortControllers: Map<string, AbortController> = new Map()
  private azureRateLimiter: AzureRateLimiter

  private constructor(settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }) {
    this.ocrSettings = settings.ocr
    this.processingSettings = settings.processing
    this.uploadSettings = settings.upload
    this.azureRateLimiter = new AzureRateLimiter()
    this.initializeQueue()
  }

  static getInstance(settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }): ProcessingService {
    // If instance exists but settings changed, update settings
    if (ProcessingService.instance) {
      ProcessingService.instance.updateSettings(settings)
      return ProcessingService.instance
    }
    
    // Create new instance if none exists
    ProcessingService.instance = new ProcessingService(settings)
    return ProcessingService.instance
  }

  updateSettings(settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }) {
    console.log('[ProcessingService] Updating settings:', settings)
    this.ocrSettings = settings.ocr
    this.processingSettings = settings.processing
    this.uploadSettings = settings.upload
  }

  private async initializeQueue() {
    const savedQueue = await db.getQueue()
    savedQueue.forEach((item) => {
      if (item.status === "processing") {
        item.status = "queued"
      }
      this.queueMap.set(item.id, item)
    })

    if (!this.isProcessing && !this.isPaused && this.ocrSettings.apiKey) {
      this.processQueue()
    }
  }

  async addToQueue(files: File[]): Promise<string[]> {
    const ids: string[] = []

    for (const file of files) {
      if (!this.isFileValid(file)) {
        throw new Error(`Invalid file: ${file.name}`)
      }

      const id = crypto.randomUUID()
      const now = new Date()
      const status: ProcessingStatus = {
        id,
        filename: file.name,
        status: this.ocrSettings.apiKey ? "queued" : "pending",
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        size: file.size,
        type: file.type,
        file,
        createdAt: now,
        updatedAt: now
      }

      this.queueMap.set(id, status)
      await db.saveToQueue(status)
      ids.push(id)
    }

    if (!this.isProcessing && !this.isPaused && this.ocrSettings.apiKey) {
      this.processQueue()
    }

    return ids
  }

  async pauseQueue() {
    this.isPaused = true
    if (this.abortControllers.size > 0) {
      Array.from(this.abortControllers.values()).forEach(controller => controller.abort())
      this.abortControllers.clear()
    }
    // Save current state to IndexedDB
    for (const status of Array.from(this.queueMap.values())) {
      if (status.status === "processing") {
        status.status = "queued"
      }
      await db.saveToQueue(status)
    }
  }

  async resumeQueue() {
    this.isPaused = false
    if (!this.isProcessing && this.ocrSettings.apiKey) {
      this.processQueue()
    }
  }

  private isFileValid(file: File): boolean {
    if (file.size > this.uploadSettings.maxFileSize * 1024 * 1024) return false
    return this.uploadSettings.allowedFileTypes.some(type =>
      file.name.toLowerCase().endsWith(type.toLowerCase())
    )
  }

  async cancelProcessing(id: string) {
    const status = this.queueMap.get(id)
    if (!status) return

    // Abort processing if in progress
    const controller = this.abortControllers.get(id)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(id)
    }

    // Update status and cleanup
    status.status = "cancelled"
    status.progress = Math.min(status.progress || 0, 100)
    status.endTime = Date.now()
    status.error = "Processing cancelled by user"
    
    // Clear any rate limit info if present
    if (status.rateLimitInfo) {
      status.rateLimitInfo = undefined
    }

    // Save to queue and notify UI
    this.queueMap.set(id, status)
    await db.saveToQueue(status)

    // If this was the only processing item, reset processing state
    const processingItems = Array.from(this.queueMap.values()).filter(
      item => item.status === "processing"
    )
    if (processingItems.length === 0) {
      this.isProcessing = false
    }
  }

  private async processQueue() {
    if (this.isProcessing || this.isPaused) return;
    this.isProcessing = true;

    try {
      const queuedItems = Array.from(this.queueMap.values())
        .filter(item => item.status === "queued")
        .slice(0, this.processingSettings.maxConcurrentJobs); // Process multiple files concurrently

      const processingPromises = queuedItems.map(async (item) => {
        try {
          // Create abort controller for this item
          const controller = new AbortController();
          this.abortControllers.set(item.id, controller);

          // Update status to processing
          item.status = "processing";
          item.startTime = Date.now();
          await db.saveToQueue(item);

          // Process the file
          const results = await this.processFile(item, controller.signal);

          // Clean up controller
          this.abortControllers.delete(item.id);

          // Check if processing was cancelled after getting results
          const updatedStatus = await this.getStatus(item.id);
          if (updatedStatus?.status === "cancelled") {
            console.log(`[Process] Processing cancelled for ${item.filename}`);
            return;
          }

          // Save results
          await db.saveResults(item.id, results);

          // Update status to completed
          item.status = "completed";
          item.endTime = Date.now();
          item.progress = 100;
          await db.saveToQueue(item);
        } catch (error) {
          console.error(`Error processing ${item.filename}:`, error);
          
          if (error instanceof Error && (
            error.name === "AbortError" || 
            error.message === "Processing aborted"
          )) {
            console.log(`[Process] Processing aborted for ${item.filename}`);
            return;
          }
          
          item.status = "error";
          item.error = error instanceof Error ? error.message : "Unknown error occurred";
          item.endTime = Date.now();
          await db.saveToQueue(item);
          this.abortControllers.delete(item.id);
        }
      });

      await Promise.all(processingPromises);
    } catch (error) {
      console.error("Queue processing error:", error);
    }

    this.isProcessing = false;

    // Check if there are more items to process
    const remainingItems = Array.from(this.queueMap.values())
      .filter(item => item.status === "queued");
      
    if (remainingItems.length > 0 && !this.isPaused) {
      // Use setTimeout to prevent stack overflow with recursive calls
      setTimeout(() => this.processQueue(), 0);
    }
  }

  private async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    if (!status.file) throw new Error("No file to process")
    console.log(`[Process] Starting ${status.filename}`);

    // For images
    if (status.file.type.startsWith("image/")) {
      const base64 = await this.fileToBase64(status.file)
      try {
        if (this.ocrSettings.provider === "microsoft") {
          await this.azureRateLimiter.waitIfLimited();
        }
        
        // Check if cancelled after rate limit wait
        if (signal.aborted) {
          console.log(`[Process] Processing aborted for ${status.filename}`);
          throw new Error("Processing aborted")
        }

        console.log(`[Process] Processing image: ${status.filename}`);
        const result = await this.callOCR(base64, signal)
        result.documentId = status.id
        result.imageUrl = `data:${status.file.type};base64,${base64}`
        console.log(`[Process] Completed image: ${status.filename}`);
        return [result]
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("RATE_LIMIT:")) {
          const retryAfter = parseInt(error.message.split(":")[1], 10)
          this.azureRateLimiter.setRateLimit(retryAfter)
          throw new Error(`Rate limited. Please try again in ${retryAfter} seconds.`)
        }
        throw error
      }
    }

    // For PDFs (all providers including Mistral)
    if (status.file.type === "application/pdf") {
      try {
        console.log(`[Process] Processing PDF: ${status.filename}`);
        const arrayBuffer = await status.file.arrayBuffer()
        const pdf = await getDocument({ data: arrayBuffer }).promise
        const numPages = pdf.numPages

        console.log(`[Process] PDF has ${numPages} pages`);
        const results: OCRResult[] = []

        // Process in chunks to avoid memory issues
        const pagesPerChunk = this.processingSettings.pagesPerChunk
        const chunks = Math.ceil(numPages / pagesPerChunk)

        for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
          if (signal.aborted) {
            console.log(`[Process] Processing aborted for ${status.filename}`);
            throw new Error("Processing aborted")
          }

          const startPage = chunkIndex * pagesPerChunk + 1
          const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, numPages)
          console.log(`[Process] Processing chunk ${chunkIndex + 1}/${chunks} (pages ${startPage}-${endPage})`);

          const chunkPromises: Promise<OCRResult>[] = []
          for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            if (signal.aborted) {
              console.log(`[Process] Processing aborted for ${status.filename}`);
              throw new Error("Processing aborted")
            }
            chunkPromises.push(this.processPage(pdf, pageNum, status, signal))
          }

          // Process pages in parallel within the chunk
          const maxConcurrentChunks = this.processingSettings.concurrentChunks
          const chunkResults = await this.processInBatches(chunkPromises, maxConcurrentChunks)
          
          // Add document ID and page number to each result
          for (let i = 0; i < chunkResults.length; i++) {
            const pageNum = startPage + i
            chunkResults[i].documentId = status.id
            chunkResults[i].pageNumber = pageNum
          }
          
          results.push(...chunkResults)
        }

        console.log(`[Process] Completed PDF: ${status.filename}`);
        return results
      } catch (error) {
        console.error(`[Process] Error processing PDF: ${error}`);
        throw error
      }
    }

    throw new Error(`Unsupported file type: ${status.file.type}`)
  }

  private async processPage(pdf: PDFDocumentProxy, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
    const page = await pdf.getPage(pageNum)
    const base64Data = await renderPageToBase64(page)
    
    if (this.ocrSettings.provider === "microsoft") {
      await this.azureRateLimiter.waitIfLimited();
    }
    
    // Check if cancelled after rate limit wait
    if (signal.aborted) {
      console.log(`[Process] Processing aborted for page ${pageNum}`);
      throw new Error("Processing aborted")
    }
    
    console.log(`[Process] Processing page ${pageNum} with ${this.ocrSettings.provider} OCR`);
    const result = await this.callOCR(base64Data, signal)
    result.imageUrl = `data:image/png;base64,${base64Data}`
    console.log(`[Process] Completed page ${pageNum} with ${this.ocrSettings.provider} OCR`);
    return result
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        resolve(base64.split(",")[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  private async callOCR(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    if (this.ocrSettings.provider === "google") {
      return this.callGoogleVision(base64Data, signal)
    } else if (this.ocrSettings.provider === "microsoft") {
      return this.callMicrosoftVision(base64Data, signal)
    } else if (this.ocrSettings.provider === "mistral") {
      return this.callMistralOCR(base64Data, signal)
    } else {
      throw new Error(`Unsupported OCR provider: ${this.ocrSettings.provider}`)
    }
  }

  private async callGoogleVision(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    const startTime = Date.now()

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.ocrSettings.apiKey}`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data,
            },
            features: [
              {
                type: "TEXT_DETECTION",
              },
            ],
            imageContext: this.ocrSettings.language
              ? {
                languageHints: [this.ocrSettings.language],
              }
              : undefined,
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Google Vision API error: ${response.status}`)
    }

    const data = await response.json()
    const result = data.responses[0]

    if (!result?.fullTextAnnotation) {
      return {
        id: crypto.randomUUID(),
        documentId: "",
        text: "",
        confidence: 0,
        language: this.ocrSettings.language || "unknown",
        processingTime: Date.now() - startTime,
        pageNumber: 1,
      }
    }

    return {
      id: crypto.randomUUID(),
      documentId: "",
      text: result.fullTextAnnotation.text,
      confidence: result.fullTextAnnotation.pages?.[0]?.confidence || 1,
      language: result.textAnnotations?.[0]?.locale || this.ocrSettings.language || "unknown",
      processingTime: Date.now() - startTime,
      pageNumber: 1,
    }
  }

  private async callMicrosoftVision(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    const startTime = Date.now()

    try {
      const raw = atob(base64Data)
      const arr = new Uint8Array(new ArrayBuffer(raw.length))
      for (let i = 0; i < raw.length; i++) {
        arr[i] = raw.charCodeAt(i)
      }

      const endpoint = `https://${this.ocrSettings.region}.api.cognitive.microsoft.com/vision/v3.2/ocr`
      const url = this.ocrSettings.language ? `${endpoint}?language=${this.ocrSettings.language}` : endpoint

      const response = await fetch(url, {
        method: "POST",
        signal,
        headers: {
          "Ocp-Apim-Subscription-Key": this.ocrSettings.apiKey,
          "Content-Type": "application/octet-stream",
        },
        body: arr,
      })

      if (!response.ok) {
        const error = await response.json()
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10)
          throw new Error(`RATE_LIMIT:${retryAfter}`)
        }
        throw new Error(error.error?.message || `Microsoft Vision API error: ${response.status}`)
      }

      const data = await response.json()

      // List of RTL language codes
      const rtlLanguages = new Set([
        'ar', // Arabic
        'he', // Hebrew
        'fa', // Persian/Farsi
        'ur', // Urdu
        'syr', // Syriac
        'n-bh', // N'Ko
        'sam', // Samaritan
        'mend', // Mandaic
        'man', // Mandaean
      ])

      const detectedLanguage = data.language || this.ocrSettings.language || "unknown"
      const isRTL = rtlLanguages.has(detectedLanguage.toLowerCase().split('-')[0])

      // Reconstruct text
      const text =
        (data as MicrosoftVisionResponse).regions
          ?.map((region) =>
            region.lines
              ?.map((line) => {
                const words = isRTL ? [...line.words].reverse() : line.words
                return words.map((word) => word.text).join(" ")
              })
              .join("\n")
          )
          .join("\n\n") || ""

      return {
        id: crypto.randomUUID(),
        documentId: "",
        text,
        confidence: 1,
        language: detectedLanguage,
        processingTime: Date.now() - startTime,
        pageNumber: 1,
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("RATE_LIMIT:")) {
        throw error
      }
      throw new Error(`Microsoft Vision API error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async callMistralOCR(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    const startTime = Date.now()

    try {
      const response = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.ocrSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-ocr-latest",
          document: {
            type: "image_url",
            image_url: `data:image/jpeg;base64,${base64Data}`
          }
        }),
        // Don't include credentials for cross-origin requests
        credentials: "omit"
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response.status}` } }))
        throw new Error(error.error?.message || `Mistral OCR API error: ${response.status}`)
      }

      const data = await response.json() as MistralOCRResponse
      
      // Extract text from Mistral OCR response
      let extractedText = ""
      
      if (data && data.text) {
        extractedText = data.text
      } else if (data && data.pages && data.pages.length > 0) {
        // Process each page in the response
        extractedText = data.pages.map((page: MistralOCRPage) => {
          if (page.markdown) {
            // Remove image references like ![img-0.jpeg](img-0.jpeg)
            const cleanedText = page.markdown
              .replace(/!\[.*?\]\(.*?\)/g, "") // Remove image references
              .replace(/\$\$([\s\S]*?)\$\$/g, "$1") // Keep math content but remove $$ delimiters
              .replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, "$1") // Keep aligned content but remove delimiters
              .trim();
            return cleanedText;
          }
          return page.text || "";
        }).join("\n\n");
      }

      return {
        id: crypto.randomUUID(),
        documentId: "",
        text: extractedText,
        confidence: 1, // Mistral doesn't provide confidence scores, so we use 1
        language: this.ocrSettings.language || "unknown",
        processingTime: Date.now() - startTime,
        pageNumber: 1,
      }
    } catch (error) {
      throw new Error(`Mistral OCR API error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || db.getQueue().then((queue) => queue.find((item) => item.id === id))
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values())
  }

  private async processInBatches<T>(promises: Promise<T>[], batchSize: number): Promise<T[]> {
    const results: T[] = []
    
    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch)
      results.push(...batchResults)
    }
    
    return results
  }
}

