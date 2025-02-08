import { CONFIG } from "@/config/constants"
import type { ProcessingStatus, OCRResult } from "@/types"
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings"
import { db } from "./indexed-db"
import { loadPDF, renderPageToBase64 } from "./pdf-utils"

export class ProcessingService {
  private queueMap: Map<string, ProcessingStatus> = new Map()
  private isProcessing = false
  private isPaused = false
  private ocrSettings: OCRSettings
  private processingSettings: ProcessingSettings
  private uploadSettings: UploadSettings
  private abortControllers: Map<string, AbortController> = new Map()

  constructor(settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }) {
    this.ocrSettings = settings.ocr
    this.processingSettings = settings.processing
    this.uploadSettings = settings.upload
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
    if (this.isProcessing || this.isPaused || !this.ocrSettings.apiKey) return

    this.isProcessing = true

    try {
      const queue = Array.from(this.queueMap.values())
      const pendingItems = queue.filter((item) => item.status === "queued")

      for (let i = 0; i < pendingItems.length; i += this.processingSettings.maxConcurrentJobs) {
        if (this.isPaused) break

        const batch = pendingItems.slice(i, i + this.processingSettings.maxConcurrentJobs)
        await Promise.all(
          batch.map(async (item) => {
            try {
              // Create new abort controller for this item
              const controller = new AbortController()
              this.abortControllers.set(item.id, controller)

              item.status = "processing"
              item.startTime = Date.now()
              await db.saveToQueue(item)

              console.log(`Processing ${item.filename}`)
              const results = await this.processFile(item, controller.signal)

              // Clean up controller
              this.abortControllers.delete(item.id)

              // Save results before updating status
              await db.saveResults(item.id, results)
              console.log(`Saved ${results.length} results for ${item.filename}`)

              item.status = "completed"
              item.endTime = Date.now()
              item.progress = 100
              await db.saveToQueue(item)
              console.log(`Completed processing ${item.filename}`)

            } catch (error) {
              console.error(`Error processing ${item.filename}:`, error)
              
              // Check if this was a cancellation
              if (error instanceof Error && error.name === "AbortError") {
                item.status = "cancelled"
              } else {
                item.status = "error"
                item.error = error instanceof Error ? error.message : "Unknown error occurred"
              }
              
              await db.saveToQueue(item)
              this.abortControllers.delete(item.id)
            }
          })
        )
      }
    } catch (error) {
      console.error("Queue processing error:", error)
    } finally {
      this.isProcessing = false

      // Check if there are more items to process
      const remainingItems = Array.from(this.queueMap.values()).filter(
        (item) => item.status === "queued"
      )
      if (remainingItems.length > 0 && !this.isPaused) {
        this.processQueue()
      }
    }
  }

  private async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    if (!status.file) throw new Error("No file to process")

    // For images, process directly
    if (status.file.type.startsWith("image/")) {
      const base64 = await this.fileToBase64(status.file)
      const result = await this.callOCR(base64, signal)
      result.documentId = status.id
      result.imageUrl = `data:${status.file.type};base64,${base64}`
      return [result]
    }

    // For PDFs, convert to images first
    if (status.file.type === "application/pdf") {
      try {
        console.log(`Starting PDF processing for ${status.filename}`)
        const pdf = await loadPDF(status.file)
        const numPages = pdf.numPages
        status.totalPages = numPages
        status.currentPage = 0
        status.progress = 0
        console.log(`PDF loaded successfully. Total pages: ${numPages}`)
        await db.saveToQueue(status)

        const results: OCRResult[] = []
        const processedPages = new Set<number>()

        // Calculate chunks more efficiently
        const chunks: number[][] = []
        for (let i = 0; i < numPages; i += this.processingSettings.pagesPerChunk) {
          const chunkSize = Math.min(this.processingSettings.pagesPerChunk, numPages - i)
          const chunk = Array.from({ length: chunkSize }, (_, j) => i + j + 1)
          chunks.push(chunk)
        }

        console.log(`Created ${chunks.length} chunks for processing`)

        // Process chunks sequentially to maintain order
        for (let i = 0; i < chunks.length; i++) {
          if (signal.aborted) {
            console.log("PDF processing aborted")
            throw new Error("Processing aborted")
          }

          const chunk = chunks[i]
          console.log(`Processing chunk ${i + 1}/${chunks.length} (pages ${chunk[0]}-${chunk[chunk.length - 1]})`)

          // Process pages within chunk concurrently
          const chunkResults = await Promise.all(
            chunk.map(async (pageNum) => {
              try {
                if (pageNum > numPages) {
                  console.warn(`Skipping invalid page number ${pageNum} (total pages: ${numPages})`)
                  return null
                }

                const page = await pdf.getPage(pageNum)
                const base64 = await renderPageToBase64(page)
                console.log(`Page ${pageNum} rendered successfully`)

                const result = await this.callOCR(base64, signal)
                result.documentId = status.id
                result.pageNumber = pageNum
                result.imageUrl = `data:image/png;base64,${base64}`

                // Update progress atomically
                processedPages.add(pageNum)
                status.currentPage = pageNum
                status.progress = (processedPages.size / numPages) * 100
                await db.saveToQueue(status)

                console.log(`OCR completed for page ${pageNum}`)
                return result
              } catch (error) {
                console.error(`Error processing page ${pageNum}:`, error)
                throw error
              }
            })
          )

          // Filter out null results and add to final results
          results.push(...chunkResults.filter((r): r is OCRResult => r !== null))
        }

        // Ensure final progress is 100%
        status.progress = 100
        status.currentPage = numPages
        await db.saveToQueue(status)

        // Return results sorted by page number
        return results.sort((a, b) => a.pageNumber - b.pageNumber)

      } catch (error) {
        console.error("PDF processing error:", error)
        throw error
      }
    }

    throw new Error(`Unsupported file type: ${status.file.type}`)
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
    const startTime = Date.now();

    // Convertir la base64 en tableau d'octets
    const raw = atob(base64Data);
    const rawLength = raw.length;
    const arr = new Uint8Array(new ArrayBuffer(rawLength));
    for (let i = 0; i < rawLength; i++) {
      arr[i] = raw.charCodeAt(i);
    }

    // Construire la requête
    const endpoint = `https://${this.ocrSettings.region}.api.cognitive.microsoft.com/vision/v3.2/ocr`;
    const url = this.ocrSettings.language ? `${endpoint}?language=${this.ocrSettings.language}` : endpoint;

    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Ocp-Apim-Subscription-Key": this.ocrSettings.apiKey,
        "Content-Type": "application/octet-stream",
      },
      body: arr,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Microsoft Vision API error: ${response.status}`);
    }

    // Récupérer la réponse JSON
    const data = await response.json();

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
    ]);

    const detectedLanguage = data.language || this.ocrSettings.language || "unknown";
    const isRTL = rtlLanguages.has(detectedLanguage.toLowerCase().split('-')[0]);

    // Reconstruire le texte
    const text =
      data.regions
        ?.map((region: any) =>
          region.lines
            ?.map((line: any) => {
              const words = isRTL ? [...line.words].reverse() : line.words;
              return words.map((word: any) => word.text).join(" ");
            })
            .join("\n")
        )
        .join("\n\n") || "";

    return {
      id: crypto.randomUUID(),
      documentId: "",
      text,
      confidence: 1,
      language: detectedLanguage,
      processingTime: Date.now() - startTime,
      pageNumber: 1,
    };
  }


  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || db.getQueue().then((queue) => queue.find((item) => item.id === id))
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values())
  }
}

