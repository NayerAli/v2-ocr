import type { ProcessingStatus } from "@/types";
import type { ProcessingSettings, UploadSettings } from "@/types/settings";
import { db } from "../database";
import { FileProcessor } from "./file-processor";

export class QueueManager {
  private queueMap: Map<string, ProcessingStatus> = new Map();
  private isProcessing = false;
  private isPaused = false;
  private processingSettings: ProcessingSettings;
  private uploadSettings: UploadSettings;
  private fileProcessor: FileProcessor;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(
    processingSettings: ProcessingSettings,
    uploadSettings: UploadSettings,
    fileProcessor: FileProcessor
  ) {
    this.processingSettings = processingSettings;
    this.uploadSettings = uploadSettings;
    this.fileProcessor = fileProcessor;
  }

  /**
   * Update processing settings
   */
  updateProcessingSettings(settings: ProcessingSettings): void {
    this.processingSettings = settings;
  }

  /**
   * Update upload settings
   */
  updateUploadSettings(settings: UploadSettings): void {
    this.uploadSettings = settings;
  }

  async initializeQueue() {
    const savedQueue = await db.getQueue();
    savedQueue.forEach((item) => {
      if (item.status === "processing") {
        item.status = "queued";
      }
      this.queueMap.set(item.id, item);
    });
  }

  async addToQueue(files: File[]): Promise<string[]> {
    console.log('[DEBUG] addToQueue called with', files.length, 'files');
    const ids: string[] = [];

    for (const file of files) {
      console.log('[DEBUG] Processing file:', file.name, 'type:', file.type, 'size:', file.size);

      if (!this.isFileValid(file)) {
        console.log('[DEBUG] Invalid file:', file.name);
        throw new Error(`Invalid file: ${file.name}`);
      }

      const id = crypto.randomUUID();
      const now = new Date();
      const status: ProcessingStatus = {
        id,
        filename: file.name,
        status: "queued",
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        size: file.size,
        type: file.type,
        file,
        createdAt: now,
        updatedAt: now
      };

      console.log('[DEBUG] Adding file to queue:', file.name, 'with ID:', id);
      this.queueMap.set(id, status);
      await db.saveToQueue(status);
      ids.push(id);
      console.log('[DEBUG] File added to queue:', file.name, 'with ID:', id);
    }

    console.log('[DEBUG] Added', ids.length, 'files to queue with IDs:', ids);

    return ids;
  }

  async processQueue() {
    console.log('[DEBUG] processQueue called, isProcessing:', this.isProcessing, 'isPaused:', this.isPaused);

    // Check if we have a valid OCR provider
    if (!this.fileProcessor.hasValidOCRProvider()) {
      console.log('[DEBUG] No valid OCR provider available, cannot process queue');
      return;
    }

    if (this.isProcessing || this.isPaused) {
      console.log('[DEBUG] Queue already processing or paused, returning');
      return;
    }

    this.isProcessing = true;
    console.log('[DEBUG] Setting isProcessing to true');

    try {
      const allItems = Array.from(this.queueMap.values());
      console.log('[DEBUG] All items in queue:', allItems.length);

      const queuedItems = allItems
        .filter(item => item.status === "queued");
      console.log('[DEBUG] Queued items:', queuedItems.length);

      const itemsToProcess = queuedItems.slice(0, this.processingSettings.maxConcurrentJobs);
      console.log('[DEBUG] Items to process:', itemsToProcess.length, 'maxConcurrentJobs:', this.processingSettings.maxConcurrentJobs);

      const processingPromises = queuedItems.map(async (item) => {
        try {
          // Create abort controller for this item
          const controller = new AbortController();
          this.abortControllers.set(item.id, controller);

          // Update status to processing
          item.status = "processing";
          item.startTime = Date.now();
          item.progress = 0; // Initialize progress to 0
          item.currentPage = 0; // Initialize current page to 0
          await db.saveToQueue(item);

          // Set up a status update interval for UI updates
          const statusUpdateInterval = setInterval(async () => {
            if (item.status === "processing") {
              // Save current status to update UI
              await db.saveToQueue({...item});
            } else {
              clearInterval(statusUpdateInterval);
            }
          }, 1000); // Update every second

          // Process the file
          const results = await this.fileProcessor.processFile(item, controller.signal);

          // Clear the status update interval
          clearInterval(statusUpdateInterval);

          // Clean up controller
          this.abortControllers.delete(item.id);

          // Check if processing was cancelled after getting results
          const updatedStatus = await this.getStatus(item.id);
          if (updatedStatus?.status === "cancelled") {
            console.log(`[Process] Processing cancelled for ${item.filename}`);
            return;
          }

          // Check for rate limiting in results
          const hasRateLimit = results.some(result => result.rateLimitInfo?.isRateLimited);
          if (hasRateLimit) {
            // Find the result with the longest retry time
            const rateLimitedResult = results
              .filter(result => result.rateLimitInfo?.isRateLimited)
              .sort((a, b) =>
                (b.rateLimitInfo?.retryAfter || 0) - (a.rateLimitInfo?.retryAfter || 0)
              )[0];

            if (rateLimitedResult?.rateLimitInfo) {
              // Update the item with rate limit info
              item.rateLimitInfo = {
                isRateLimited: true,
                retryAfter: rateLimitedResult.rateLimitInfo.retryAfter,
                rateLimitStart: Date.now()
              };

              console.log(`[Process] Rate limited for ${item.filename}. Retry after ${rateLimitedResult.rateLimitInfo.retryAfter}s`);

              // If we have partial results, save them
              if (results.some(r => r.text && r.text.length > 0)) {
                await db.saveResults(item.id, results);
                item.progress = Math.floor((results.length / (item.totalPages || 1)) * 100);
              }

              // Keep the item in processing state but with rate limit info
              await db.saveToQueue(item);
              return;
            }
          }

          // Save results in batches to avoid memory issues with large PDFs
          const isLargePDF = item.totalPages && item.totalPages > 100;
          const BATCH_SIZE = isLargePDF ? 20 : 50; // Smaller batches for large PDFs

          if (results.length > BATCH_SIZE) {
            console.log(`[Process] Saving ${results.length} results in batches of ${BATCH_SIZE}`);

            // Save results in batches
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
              const batch = results.slice(i, i + BATCH_SIZE);
              console.log(`[Process] Saving batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(results.length / BATCH_SIZE)} (${batch.length} results)`);
              await db.saveResults(item.id, batch);

              // Update progress
              const savedCount = Math.min(i + BATCH_SIZE, results.length);
              item.progress = Math.floor((savedCount / results.length) * 100);
              await db.saveToQueue(item);
            }
          } else {
            // Save all results at once for smaller PDFs
            await db.saveResults(item.id, results);
          }

          // Update status to completed
          item.status = "completed";
          item.endTime = Date.now();
          item.progress = 100;
          // Clear any rate limit info
          item.rateLimitInfo = undefined;
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

          // Check if the error is related to rate limiting
          const isRateLimitError = error instanceof Error &&
            (error.message.includes("429") || error.message.includes("rate limit"));

          if (isRateLimitError) {
            // Set a default retry time of 60 seconds if we can't extract it
            const retryAfter = 60;
            item.rateLimitInfo = {
              isRateLimited: true,
              retryAfter,
              rateLimitStart: Date.now()
            };
            console.log(`[Process] Rate limited for ${item.filename}. Retry after ${retryAfter}s`);
            await db.saveToQueue(item);
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
    console.log('[DEBUG] Setting isProcessing to false');

    // Check if there are more items to process
    const remainingItems = Array.from(this.queueMap.values())
      .filter(item => item.status === "queued");
    console.log('[DEBUG] Remaining queued items:', remainingItems.length);

    // Check for rate-limited items that are ready to retry
    const rateLimitedItems = Array.from(this.queueMap.values())
      .filter(item =>
        item.status === "processing" &&
        item.rateLimitInfo?.isRateLimited &&
        Date.now() >= (item.rateLimitInfo.rateLimitStart + (item.rateLimitInfo.retryAfter * 1000))
      );
    console.log('[DEBUG] Rate-limited items ready to retry:', rateLimitedItems.length);

    // Reset rate-limited items to queued state if they're ready to retry
    if (rateLimitedItems.length > 0) {
      for (const item of rateLimitedItems) {
        console.log(`[DEBUG] Rate limit period ended for ${item.filename}. Requeuing...`);
        item.status = "queued";
        item.rateLimitInfo = undefined;
        await db.saveToQueue(item);
      }
    }

    if ((remainingItems.length > 0 || rateLimitedItems.length > 0) && !this.isPaused) {
      console.log('[DEBUG] More items to process, scheduling next processQueue call');
      // Use setTimeout to prevent stack overflow with recursive calls
      setTimeout(() => this.processQueue(), 0);
    } else {
      console.log('[DEBUG] No more items to process or queue is paused');
    }
  }

  async pauseQueue() {
    this.isPaused = true;
    if (this.abortControllers.size > 0) {
      Array.from(this.abortControllers.values()).forEach(controller => controller.abort());
      this.abortControllers.clear();
    }
    // Save current state to IndexedDB
    for (const status of Array.from(this.queueMap.values())) {
      if (status.status === "processing") {
        status.status = "queued";
      }
      await db.saveToQueue(status);
    }
  }

  async resumeQueue() {
    this.isPaused = false;
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async cancelProcessing(id: string) {
    const status = this.queueMap.get(id);
    if (!status) return;

    // Abort processing if in progress
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }

    // Update status and cleanup
    status.status = "cancelled";
    status.progress = Math.min(status.progress || 0, 100);
    status.endTime = Date.now();
    status.error = "Processing cancelled by user";

    // Clear any rate limit info if present
    if (status.rateLimitInfo) {
      status.rateLimitInfo = undefined;
    }

    // Save to queue and notify UI
    this.queueMap.set(id, status);
    await db.saveToQueue(status);

    // If this was the only processing item, reset processing state
    const processingItems = Array.from(this.queueMap.values()).filter(
      item => item.status === "processing"
    );
    if (processingItems.length === 0) {
      this.isProcessing = false;
    }
  }

  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || db.getQueue().then((queue) => queue.find((item) => item.id === id));
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values());
  }

  private isFileValid(file: File): boolean {
    if (file.size > this.uploadSettings.maxFileSize * 1024 * 1024) return false;
    return this.uploadSettings.allowedFileTypes.some(type =>
      file.name.toLowerCase().endsWith(type.toLowerCase())
    );
  }
}