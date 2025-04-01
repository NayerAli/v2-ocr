import type { ProcessingStatus, OCRResult } from "@/types";
import type { ProcessingSettings, UploadSettings } from "@/types/settings";
import { getDatabaseService, type DatabaseProvider } from "../db-factory";
import { FileProcessor } from "./file-processor";
import { useSettings } from "@/store/settings";
import { createFileStorageAdapter } from "./file-storage-adapter";

export class QueueManager {
  private queueMap: Map<string, ProcessingStatus> = new Map();
  private isProcessing = false;
  private isPaused = false;
  private processingSettings: ProcessingSettings;
  private uploadSettings: UploadSettings;
  private fileProcessor: FileProcessor;
  private abortControllers: Map<string, AbortController> = new Map();
  private db: ReturnType<typeof getDatabaseService>;
  private unsubscribe: () => void;
  private fileStorage = createFileStorageAdapter();

  constructor(
    processingSettings: ProcessingSettings, 
    uploadSettings: UploadSettings,
    fileProcessor: FileProcessor
  ) {
    this.processingSettings = processingSettings;
    this.uploadSettings = uploadSettings;
    this.fileProcessor = fileProcessor;
    
    // Get the current database service based on user's settings
    const settings = useSettings.getState();
    this.db = getDatabaseService(settings.database.preferredProvider);
    
    // Listen for changes to database provider setting
    this.unsubscribe = useSettings.subscribe(
      (state) => {
        // When database provider changes, update the database service
        if (state.database.preferredProvider !== settings.database.preferredProvider) {
          this.db = getDatabaseService(state.database.preferredProvider);
        }
      }
    );
  }

  async initializeQueue() {
    const savedQueue = await this.db.getQueue();
    savedQueue.forEach((item) => {
      if (item.status === "processing") {
        item.status = "queued";
      }
      this.queueMap.set(item.id, item);
    });
  }

  async addToQueue(files: File[]): Promise<string[]> {
    const ids: string[] = [];
    
    for (const file of files) {
      if (file.size > this.uploadSettings.maxFileSize * 1024 * 1024) {
        console.warn(`File ${file.name} exceeds max size limit of ${this.uploadSettings.maxFileSize}MB`);
        continue;
      }
      
      const id = crypto.randomUUID();
      const fileType = file.type || file.name.split('.').pop() || 'unknown';
      
      // Create a new status object for this file
      const status: ProcessingStatus = {
        id,
        filename: file.name,
        fileType,
        fileSize: file.size,
        status: "queued",
        progress: 0,
        file, // Store reference to file for processing
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // If we're using Supabase, upload the file to storage
      try {
        const fileUrl = await this.fileStorage.uploadFile(file, id);
        if (fileUrl) {
          status.fileUrl = fileUrl;
        }
      } catch (error) {
        console.error(`[Queue] Error uploading file to storage: ${error}`);
        // Continue with local file reference even if upload fails
      }
      
      // Add to local queue and persisted queue
      this.queueMap.set(id, status);
      await this.db.saveToQueue(status);
      ids.push(id);
    }
    
    return ids;
  }

  async processQueue() {
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
          item.progress = 0; // Initialize progress to 0
          item.currentPage = 0; // Initialize current page to 0
          await this.db.saveToQueue(item);

          // Set up a status update interval for UI updates
          const statusUpdateInterval = setInterval(async () => {
            if (item.status === "processing") {
              // Save current status to update UI
              await this.db.saveToQueue({...item});
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
            const rateLimitInfo = results.find(r => r.rateLimitInfo)?.rateLimitInfo;
            item.status = "rate_limited";
            item.rateLimitInfo = rateLimitInfo;
            console.log(`[Process] Rate limited: ${item.filename} - Retry after ${rateLimitInfo?.retryAfter}ms`);
          } else {
            // Update status to completed
            item.status = "completed";
            item.progress = 100;
            item.endTime = Date.now();
            item.error = undefined;
          }
          
          await this.db.saveToQueue(item);
          
          // Save OCR results if not rate limited
          if (!hasRateLimit) {
            await this.db.saveResults(item.id, results);
          }
        } catch (error) {
          console.error(`[Process] Processing error for ${item.filename}:`, error);
          
          // Check if processing was cancelled
          if (error instanceof Error && error.name === "AbortError") {
            console.log(`[Process] Processing cancelled for ${item.filename}`);
            return;
          }
          
          // Update status to error
          item.status = "error";
          item.endTime = Date.now();
          item.error = error instanceof Error ? error.message : `Unknown error: ${error}`;
          await this.db.saveToQueue(item);
        }
      });

      // Wait for all processes to complete
      await Promise.all(processingPromises);

      // Check if there are more items to process
      const remainingItems = Array.from(this.queueMap.values()).filter(
        item => item.status === "queued"
      );
      
      // Check for rate-limited items that can be retried
      const rateLimitedItems = Array.from(this.queueMap.values())
        .filter(item => {
          if (item.status !== "rate_limited" || !item.rateLimitInfo) return false;
          
          const now = Date.now();
          const retryTime = item.rateLimitInfo.timestamp + item.rateLimitInfo.retryAfter;
          return now >= retryTime;
        });
      
      this.isProcessing = false;
      
      // Reset rate-limited items to queued state if they're ready to retry
      if (rateLimitedItems.length > 0) {
        for (const item of rateLimitedItems) {
          console.log(`[Process] Rate limit period ended for ${item.filename}. Requeuing...`);
          item.status = "queued";
          item.rateLimitInfo = undefined;
          await this.db.saveToQueue(item);
        }
      }
        
      if ((remainingItems.length > 0 || rateLimitedItems.length > 0) && !this.isPaused) {
        // Use setTimeout to prevent stack overflow with recursive calls
        setTimeout(() => this.processQueue(), 0);
      }
    } catch (error) {
      console.error("[Process] Queue processing error:", error);
      this.isProcessing = false;
    }
  }

  async pauseQueue() {
    this.isPaused = true;
    if (this.abortControllers.size > 0) {
      Array.from(this.abortControllers.values()).forEach(controller => controller.abort());
      this.abortControllers.clear();
    }
    // Save current state to the database
    for (const status of Array.from(this.queueMap.values())) {
      if (status.status === "processing") {
        status.status = "queued";
      }
      await this.db.saveToQueue(status);
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
    await this.db.saveToQueue(status);

    // If this was the only processing item, reset processing state
    const processingItems = Array.from(this.queueMap.values()).filter(
      item => item.status === "processing"
    );
    if (processingItems.length === 0) {
      this.isProcessing = false;
    }
  }

  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || this.db.getQueue().then((queue) => queue.find((item) => item.id === id));
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values());
  }
  
  /**
   * Cleanup method to be called when QueueManager is no longer needed
   * Unsubscribes from settings changes to prevent memory leaks
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Abort any in-progress operations
    if (this.abortControllers.size > 0) {
      Array.from(this.abortControllers.values()).forEach(controller => controller.abort());
      this.abortControllers.clear();
    }
  }
} 