import { CONFIG } from "@/config/constants"
import type { ProcessingStatus, OCRSettings, OCRResult } from "@/types"
import { db } from "./indexed-db"
import { loadPDF, renderPageToBase64 } from "./pdf-utils"

export class ProcessingService {
  private queueMap: Map<string, ProcessingStatus> = new Map()
  private isProcessing = false
  private isPaused = false
  private settings: OCRSettings
  private abortController: AbortController | null = null

  constructor(settings: OCRSettings) {
    this.settings = settings
    this.initializeQueue()
  }

  private async initializeQueue() {
    const savedQueue = await db.getQueue()
    savedQueue.forEach((item) => {
      // Reset any "processing" items to "queued" on initialization
      if (item.status === "processing") {
        item.status = "queued"
      }
      this.queueMap.set(item.id, item)
    })

    if (!this.isProcessing && !this.isPaused && this.settings.apiKey) {
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
        status: this.settings.apiKey ? "queued" : "pending",
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

    if (!this.isProcessing && !this.isPaused && this.settings.apiKey) {
      this.processQueue()
    }

    return ids
  }

  async pauseQueue() {
    this.isPaused = true
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
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
    if (!this.isProcessing && this.settings.apiKey) {
      this.processQueue()
    }
  }

  private isFileValid(file: File): boolean {
    if (file.size > CONFIG.MAX_FILE_SIZE) return false
    return Object.keys(CONFIG.SUPPORTED_TYPES).some((type) => file.type === type)
  }

  private async processQueue() {
    if (!this.settings.apiKey) {
      console.log("No API key configured, processing paused")
      return
    }

    this.isProcessing = true
    this.abortController = new AbortController()

    try {
      while (this.queueMap.size > 0 && !this.isPaused) {
        const [id, status] =
          Array.from(this.queueMap.entries()).find(([_, s]) => s.status === "queued" || s.status === "pending") || []

        if (!id || !status || !status.file) break

        try {
          status.status = "processing"
          status.startTime = Date.now()
          await db.saveToQueue(status)

          const results = await this.processFile(status, this.abortController.signal)

          status.status = "completed"
          status.endTime = Date.now()
          status.results = results
          await db.saveToQueue(status)
          await db.saveResults(id, results)
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            status.status = "queued"
          } else {
            status.status = "error"
            status.error = error instanceof Error ? error.message : "Unknown error"
          }
          await db.saveToQueue(status)
        }

        if (status.status === "completed" || status.status === "error") {
          this.queueMap.delete(id)
          // Keep in IndexedDB for history
        }
      }
    } finally {
      this.isProcessing = false
      this.abortController = null
    }
  }

  private async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
    if (!status.file) throw new Error("No file to process")

    // For images, process directly
    if (status.file.type.startsWith("image/")) {
      const base64 = await this.fileToBase64(status.file)
      const result = await this.callOCR(base64, signal)
      result.imageUrl = `data:${status.file.type};base64,${base64}`
      return [result]
    }

    // For PDFs, convert to images first
    if (status.file.type === "application/pdf") {
      try {
        console.log(`Starting PDF processing for ${status.filename}`)
        const pdf = await loadPDF(status.file)
        status.totalPages = pdf.numPages
        console.log(`PDF loaded successfully. Total pages: ${pdf.numPages}`)
        await db.saveToQueue(status)

        const results: OCRResult[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          if (signal.aborted) {
            console.log("PDF processing aborted")
            throw new Error("Processing aborted")
          }

          console.log(`Processing page ${i} of ${pdf.numPages}`)
          status.currentPage = i
          status.progress = (i / pdf.numPages) * 100
          await db.saveToQueue(status)

          try {
            const page = await pdf.getPage(i)
            const base64 = await renderPageToBase64(page)
            console.log(`Page ${i} rendered successfully`)

            const result = await this.callOCR(base64, signal)
            result.pageNumber = i
            // Store as PNG for better quality
            result.imageUrl = `data:image/png;base64,${base64}`
            results.push(result)
            console.log(`OCR completed for page ${i}`)
          } catch (pageError) {
            console.error(`Error processing page ${i}:`, pageError)
            results.push({
              id: crypto.randomUUID(),
              documentId: "",
              text: `[Error processing page ${i}]`,
              confidence: 0,
              language: this.settings.language || "unknown",
              processingTime: 0,
              pageNumber: i,
              error: pageError instanceof Error ? pageError.message : "Unknown error",
            })
          }
        }

        if (results.length === 0) {
          throw new Error("No pages could be processed successfully")
        }

        console.log(`PDF processing completed. Processed ${results.length} pages`)
        return results
      } catch (error) {
        console.error("PDF processing error:", error)
        throw new Error(
          error instanceof Error
            ? `Failed to process PDF: ${error.message}`
            : "Failed to process PDF"
        )
      }
    }

    throw new Error("Unsupported file type")
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        // Return the raw base64 data without compression
        resolve(base64.split(",")[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  private async callOCR(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    if (this.settings.provider === "google") {
      return this.callGoogleVision(base64Data, signal)
    } else {
      return this.callMicrosoftVision(base64Data, signal)
    }
  }

  private async callGoogleVision(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    const startTime = Date.now()

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.settings.apiKey}`, {
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
            imageContext: this.settings.language
              ? {
                  languageHints: [this.settings.language],
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
        language: "",
        processingTime: Date.now() - startTime,
        pageNumber: 1,
      }
    }

    return {
      id: crypto.randomUUID(),
      documentId: "",
      text: result.fullTextAnnotation.text,
      confidence: result.fullTextAnnotation.pages?.[0]?.confidence || 1,
      language: result.textAnnotations?.[0]?.locale || this.settings.language || "unknown",
      processingTime: Date.now() - startTime,
      pageNumber: 1,
    }
  }

  private async callMicrosoftVision(base64Data: string, signal: AbortSignal): Promise<OCRResult> {
    const startTime = Date.now()

    // Convert base64 to binary
    const raw = atob(base64Data)
    const rawLength = raw.length
    const arr = new Uint8Array(new ArrayBuffer(rawLength))
    for (let i = 0; i < rawLength; i++) {
      arr[i] = raw.charCodeAt(i)
    }

    const endpoint = `https://${this.settings.region}.api.cognitive.microsoft.com/vision/v3.2/ocr`
    const url = this.settings.language ? `${endpoint}?language=${this.settings.language}` : endpoint

    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Ocp-Apim-Subscription-Key": this.settings.apiKey,
        "Content-Type": "application/octet-stream",
      },
      body: arr,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Microsoft Vision API error: ${response.status}`)
    }

    const data = await response.json()
    const text =
      data.regions
        ?.map((region: any) =>
          region.lines?.map((line: any) => line.words?.map((word: any) => word.text).join(" ")).join("\n"),
        )
        .join("\n\n") || ""

    return {
      id: crypto.randomUUID(),
      documentId: "",
      text,
      confidence: 1, // Microsoft doesn't provide confidence scores
      language: data.language || this.settings.language || "unknown",
      processingTime: Date.now() - startTime,
      pageNumber: 1,
    }
  }

  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || db.getQueue().then((queue) => queue.find((item) => item.id === id))
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values())
  }
}

