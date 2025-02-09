import { CONFIG } from "@/config/constants"
import type { ProcessingStatus, OCRResult } from "@/types"
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings"
import { db } from "./indexed-db"
import { loadPDF, renderPageToBase64 } from "./pdf-utils"

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

export class ProcessingService {
  private queueMap: Map<string, ProcessingStatus> = new Map()
  private isProcessing = false
  private isPaused = false
  private ocrSettings: OCRSettings
  private processingSettings: ProcessingSettings
  private uploadSettings: UploadSettings
  private abortControllers: Map<string, AbortController> = new Map()
  private azureRateLimiter: AzureRateLimiter

  constructor(settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }) {
    this.ocrSettings = settings.ocr
    this.processingSettings = settings.processing
    this.uploadSettings = settings.upload
    this.azureRateLimiter = new AzureRateLimiter()
    this.initializeQueue()
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
        createdAt: new Date(),
        updatedAt: new Date()
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

    // Update status
    status.status = "cancelled"
    status.progress = 0
    status.endTime = Date.now()
    await db.saveToQueue(status)
  }

  private async processQueue() {
    if (this.isProcessing || this.isPaused) return;
    this.isProcessing = true;

    try {
      const queuedItems = Array.from(this.queueMap.values()).filter(
        (item) => item.status === "queued"
      );

      for (const item of queuedItems) {
        if (this.isPaused) break;

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

          // Save results
          await db.saveResults(item.id, results);

          // Update status to completed
          item.status = "completed";
          item.endTime = Date.now();
          item.progress = 100;
          await db.saveToQueue(item);

        } catch (error) {
          console.error(`Error processing ${item.filename}:`, error);
          
          // Check if this was a cancellation
          if (error instanceof Error && error.name === "AbortError") {
            item.status = "cancelled";
          } else {
            item.status = "error";
            item.error = error instanceof Error ? error.message : "Unknown error occurred";
          }
          
          await db.saveToQueue(item);
          this.abortControllers.delete(item.id);
        }
      }
    } catch (error) {
      console.error("Queue processing error:", error);
    } finally {
      this.isProcessing = false;

      // Check if there are more items to process
      const remainingItems = Array.from(this.queueMap.values()).filter(
        (item) => item.status === "queued"
      );
      if (remainingItems.length > 0 && !this.isPaused) {
        // Use setTimeout to prevent stack overflow with recursive calls
        setTimeout(() => this.processQueue(), 0);
      }
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
        console.log(`[Process] Processing image: ${status.filename}`);
        const result = await this.callOCR(base64, signal)
        result.documentId = status.id
        result.imageUrl = `data:${status.file.type};base64,${base64}`
        console.log(`[Process] Completed image: ${status.filename}`);
        return [result]
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("RATE_LIMIT:")) {
          const retryAfter = parseInt(error.message.split(":")[1], 10)
          console.log(`[Process] Rate limit on ${status.filename} - Waiting ${retryAfter}s`);
          this.azureRateLimiter.setRateLimit(retryAfter);
          status.rateLimitInfo = {
            isRateLimited: true,
            retryAfter,
            rateLimitStart: Date.now()
          }
          await db.saveToQueue(status)
          await this.azureRateLimiter.waitIfLimited();
          status.rateLimitInfo = undefined
          await db.saveToQueue(status)
          return this.processFile(status, signal)
        }
        throw error
      }
    }

    // For PDFs
    if (status.file.type === "application/pdf") {
      try {
        const pdf = await loadPDF(status.file)
        const numPages = pdf.numPages
        const concurrentChunks = this.processingSettings.concurrentChunks
        const pagesPerChunk = this.processingSettings.pagesPerChunk
        
        console.log(`[Process] Starting PDF: ${status.filename} (${numPages} pages)`);
        console.log(`[Process] Using ${concurrentChunks} concurrent chunks, ${pagesPerChunk} pages per chunk`);
        
        status.totalPages = numPages
        status.currentPage = 0
        status.progress = 0
        await db.saveToQueue(status)

        const results: OCRResult[] = []
        const processedPages = new Set<number>()

        // Process pages in chunks
        for (let startPage = 1; startPage <= numPages; startPage += pagesPerChunk * concurrentChunks) {
          if (signal.aborted) throw new Error("Processing aborted")

          const chunkPromises: Promise<OCRResult>[] = []
          
          // Create chunks for concurrent processing
          for (let chunk = 0; chunk < concurrentChunks && startPage + (chunk * pagesPerChunk) <= numPages; chunk++) {
            const chunkStartPage = startPage + (chunk * pagesPerChunk)
            const chunkEndPage = Math.min(chunkStartPage + pagesPerChunk - 1, numPages)
            
            console.log(`[Process] Creating chunk ${chunk + 1}: pages ${chunkStartPage}-${chunkEndPage}`);
            
            for (let pageNum = chunkStartPage; pageNum <= chunkEndPage; pageNum++) {
              chunkPromises.push(
                (async () => {
                  try {
                    console.log(`[Process] Starting page ${pageNum}/${numPages}`);
                    const page = await pdf.getPage(pageNum)
                    const base64 = await renderPageToBase64(page)

                    if (this.ocrSettings.provider === "microsoft") {
                      await this.azureRateLimiter.waitIfLimited();
                    }

                    const result = await this.callOCR(base64, signal)
                    result.documentId = status.id
                    result.pageNumber = pageNum
                    result.imageUrl = `data:image/png;base64,${base64}`

                    processedPages.add(pageNum)
                    status.currentPage = pageNum
                    status.progress = Math.round((processedPages.size / numPages) * 100)
                    console.log(`[Process] Completed page ${pageNum}/${numPages} (${status.progress}%)`);
                    await db.saveToQueue(status)

                    return result
                  } catch (error) {
                    if (error instanceof Error && error.message.startsWith("RATE_LIMIT:")) {
                      const retryAfter = parseInt(error.message.split(":")[1], 10)
                      console.log(`[Process] Rate limit on page ${pageNum} - Waiting ${retryAfter}s`);
                      this.azureRateLimiter.setRateLimit(retryAfter);
                      status.rateLimitInfo = {
                        isRateLimited: true,
                        retryAfter,
                        rateLimitStart: Date.now()
                      }
                      await db.saveToQueue(status)
                      await this.azureRateLimiter.waitIfLimited();
                      status.rateLimitInfo = undefined
                      await db.saveToQueue(status)
                      // Retry this page
                      return this.processPage(pdf, pageNum, status, signal)
                    }
                    throw error
                  }
                })()
              )
            }
          }

          // Process current batch of chunks
          const chunkResults = await Promise.all(chunkPromises)
          results.push(...chunkResults)
        }

        status.progress = 100
        status.currentPage = numPages
        await db.saveToQueue(status)
        console.log(`[Process] Completed PDF: ${status.filename}`);

        return results.sort((a, b) => a.pageNumber - b.pageNumber)
      } catch (error) {
        console.error(`[Process] Error processing PDF ${status.filename}:`, error)
        throw error
      }
    }

    throw new Error(`Unsupported file type: ${status.file.type}`)
  }

  // Helper method to process a single page (used for retries)
  private async processPage(pdf: any, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
    const page = await pdf.getPage(pageNum)
    const base64 = await renderPageToBase64(page)

    if (this.ocrSettings.provider === "microsoft") {
      await this.azureRateLimiter.waitIfLimited();
    }

    const result = await this.callOCR(base64, signal)
    result.documentId = status.id
    result.pageNumber = pageNum
    result.imageUrl = `data:image/png;base64,${base64}`
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
    } else {
      return this.callMicrosoftVision(base64Data, signal)
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

      // Reconstruire le texte
      const text =
        data.regions
          ?.map((region: any) =>
            region.lines
              ?.map((line: any) => {
                const words = isRTL ? [...line.words].reverse() : line.words
                return words.map((word: any) => word.text).join(" ")
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

  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || db.getQueue().then((queue) => queue.find((item) => item.id === id))
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values())
  }
}

