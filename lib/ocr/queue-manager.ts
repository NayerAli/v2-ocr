import type { ProcessingStatus } from "@/types";
import type { ProcessingSettings, UploadSettings } from "@/types/settings";
import { db } from "../database";
import { FileProcessor } from "./file-processor";
import { updateDocumentStatus, retryDocument as retryDocumentUtil } from "./document-status-utils";

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
      // Generate a storage path for the file (without user ID, which will be added during upload)
      const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
      // Use the old path structure with migrated_1 for compatibility
      const storagePath = `${id}/migrated_1${fileExtension}`;

      const status: ProcessingStatus = {
        id,
        filename: file.name,
        originalFilename: file.name,
        status: "queued",
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        fileSize: file.size,
        fileType: file.type,
        storagePath: storagePath, // Add storage path
        file,
        createdAt: now,
        updatedAt: now
      };

      console.log('[DEBUG] Adding file to queue:', file.name, 'with ID:', id);

      // Upload file to Supabase storage
      try {
        console.log('[DEBUG] Uploading file to storage:', file.name);
        // We only care about the error, not the data
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { data: uploadData, error: uploadError } = await this.uploadFileToStorage(file, storagePath);

        if (uploadError) {
          console.error('[DEBUG] Error uploading file to storage:', uploadError);
          const errorMessage = typeof uploadError === 'object' && uploadError !== null && 'message' in uploadError
            ? uploadError.message
            : 'Unknown error';
          throw new Error(`Failed to upload file: ${errorMessage}`);
        }

        console.log('[DEBUG] File uploaded successfully to storage');
      } catch (error) {
        console.error('[DEBUG] Exception uploading file to storage:', error);
        throw new Error('Failed to upload file to storage');
      }

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
          console.log(`[DEBUG] Setting document ${item.id} status to processing`);

          // Use the utility function to update the document status
          const processingItem = await updateDocumentStatus(item, "processing");

          // Update additional fields
          processingItem.processingStartedAt = new Date();
          processingItem.progress = 0; // Initialize progress to 0
          processingItem.currentPage = 0; // Initialize current page to 0

          // Save to database
          await db.saveToQueue(processingItem);

          // Update the item reference for the rest of the processing
          Object.assign(item, processingItem);

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
              console.log(`[Process] Rate limited for ${item.filename}. Retry after ${rateLimitedResult.rateLimitInfo.retryAfter}s`);

              // Use the utility function to update the document status but keep it as "processing"
              // since it's rate-limited, not failed
              const rateLimitedItem = await updateDocumentStatus(item, "processing");

              // Add rate limit info
              rateLimitedItem.rateLimitInfo = {
                isRateLimited: true,
                retryAfter: rateLimitedResult.rateLimitInfo.retryAfter,
                rateLimitStart: Date.now()
              };

              // If we have partial results, save them
              if (results.some(r => r.text && r.text.length > 0)) {
                await db.saveResults(item.id, results);
                rateLimitedItem.progress = Math.floor((results.length / (rateLimitedItem.totalPages || 1)) * 100);
              }

              // Save to database
              await db.saveToQueue(rateLimitedItem);

              // Update the queue map
              this.queueMap.set(item.id, rateLimitedItem);
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
          console.log(`[DEBUG] Setting document ${item.id} status to completed`);

          // Use the utility function to update the document status
          const completedItem = await updateDocumentStatus(item, "completed");

          // Update additional fields
          completedItem.processingCompletedAt = new Date();
          completedItem.progress = 100;
          // Clear any rate limit info
          completedItem.rateLimitInfo = undefined;

          // Save to database
          await db.saveToQueue(completedItem);

          // Update the queue map
          this.queueMap.set(item.id, completedItem);
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
            console.log(`[Process] Rate limited for ${item.filename}. Retry after ${retryAfter}s`);

            // Use the utility function to update the document status but keep it as "processing"
            // since it's rate-limited, not failed
            const individualRateLimitedItem = await updateDocumentStatus(item, "processing");

            // Add rate limit info
            individualRateLimitedItem.rateLimitInfo = {
              isRateLimited: true,
              retryAfter,
              rateLimitStart: Date.now()
            };

            // Save to database
            await db.saveToQueue(individualRateLimitedItem);

            // Update the queue map
            this.queueMap.set(item.id, individualRateLimitedItem);
            return;
          }

          // Update status to error
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          console.log(`[DEBUG] Setting document ${item.id} status to error: ${errorMessage}`);

          // Use the utility function to update the document status
          const updatedItem = await updateDocumentStatus(item, "error", errorMessage);

          // Update additional fields
          updatedItem.processingCompletedAt = new Date();

          // Make sure the item is in the queue map
          this.queueMap.set(item.id, updatedItem);

          // Clean up abort controller
          this.abortControllers.delete(item.id);

          console.log(`[DEBUG] Document ${item.id} (${item.filename}) marked as error: ${item.error}`);
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

        // Use the utility function to update the document status
        const requeuedItem = await updateDocumentStatus(item, "queued");

        // Clear rate limit info
        requeuedItem.rateLimitInfo = undefined;

        // Save to database
        await db.saveToQueue(requeuedItem);

        // Update the queue map
        this.queueMap.set(item.id, requeuedItem);
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
    console.log('[DEBUG] QueueManager.pauseQueue called');
    this.isPaused = true;

    if (this.abortControllers.size > 0) {
      Array.from(this.abortControllers.values()).forEach(controller => controller.abort());
      this.abortControllers.clear();
    }

    // Save current state to IndexedDB
    for (const status of Array.from(this.queueMap.values())) {
      if (status.status === "processing") {
        console.log(`[DEBUG] Changing processing document ${status.id} to queued`);
        // Use the utility function to update the document status
        const updatedStatus = await updateDocumentStatus(status, "queued");
        // Update the queue map
        this.queueMap.set(status.id, updatedStatus);
      }
    }

    console.log('[DEBUG] Queue paused successfully');
  }

  async resumeQueue() {
    this.isPaused = false;
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async cancelProcessing(id: string) {
    console.log(`[DEBUG] QueueManager.cancelProcessing called for ${id}`);

    const status = this.queueMap.get(id);
    if (!status) {
      console.log(`[DEBUG] Document ${id} not found in queue map, cannot cancel`);
      return;
    }

    // Abort processing if in progress
    const controller = this.abortControllers.get(id);
    if (controller) {
      console.log(`[DEBUG] Aborting processing for document ${id}`);
      controller.abort();
      this.abortControllers.delete(id);
    }

    // Update status and cleanup
    console.log(`[DEBUG] Updating document ${id} status to cancelled`);

    // Use the utility function to update the document status
    const updatedStatus = await updateDocumentStatus(
      status,
      "cancelled",
      "Processing cancelled by user"
    );

    // Update additional fields
    updatedStatus.progress = Math.min(updatedStatus.progress || 0, 100);
    updatedStatus.processingCompletedAt = new Date();

    // Clear any rate limit info if present
    if (updatedStatus.rateLimitInfo) {
      updatedStatus.rateLimitInfo = undefined;
    }

    // Update the queue map
    this.queueMap.set(id, updatedStatus);

    // Save to database
    await db.saveToQueue(updatedStatus);

    console.log(`[DEBUG] Document ${id} cancelled successfully`);

    // If this was the only processing item, reset processing state
    const processingItems = Array.from(this.queueMap.values()).filter(
      item => item.status === "processing"
    );
    if (processingItems.length === 0) {
      console.log(`[DEBUG] No more processing items, resetting isProcessing to false`);
      this.isProcessing = false;
    }
  }

  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    return this.queueMap.get(id) || db.getQueue().then((queue) => queue.find((item) => item.id === id));
  }

  async getAllStatus(): Promise<ProcessingStatus[]> {
    return Array.from(this.queueMap.values());
  }

  /**
   * Update the status of a specific item in the queue
   * This is used when we need to manually update an item's status
   */
  async updateItemStatus(item: ProcessingStatus): Promise<void> {
    console.log(`[DEBUG] QueueManager.updateItemStatus called for ${item.id} with status ${item.status}`);

    // Use the utility function to update the document status
    const updatedItem = await updateDocumentStatus(item, item.status, item.error || undefined);

    // Update the item in the queue map
    this.queueMap.set(item.id, updatedItem);

    console.log(`[DEBUG] Updated status for item ${item.id} to ${item.status}`);
  }

  /**
   * Retry a failed document
   * This is used when a document has failed and we want to retry it
   */
  async retryDocument(id: string): Promise<ProcessingStatus | null> {
    console.log(`[DEBUG] QueueManager.retryDocument called for ${id}`);

    // Get the document from the queue map or database
    let document = this.queueMap.get(id);

    if (!document) {
      console.log(`[DEBUG] Document ${id} not found in queue map, fetching from database`);
      const queue = await db.getQueue();
      document = queue.find(item => item.id === id);

      if (!document) {
        console.error(`[DEBUG] Document ${id} not found in database`);
        return null;
      }
    }

    // Use the utility function to retry the document
    const retryResult = await retryDocumentUtil(id);

    if (!retryResult) {
      console.error(`[DEBUG] Failed to retry document ${id}`);
      return null;
    }

    // Update the queue map with the retried document
    this.queueMap.set(id, retryResult);

    // Start processing the queue if not already processing
    if (!this.isProcessing && !this.isPaused) {
      console.log(`[DEBUG] Starting queue processing for retried document`);
      this.processQueue();
    }

    return retryResult;
  }

  private isFileValid(file: File): boolean {
    if (file.size > this.uploadSettings.maxFileSize * 1024 * 1024) return false;
    return this.uploadSettings.allowedFileTypes.some(type =>
      file.name.toLowerCase().endsWith(type.toLowerCase())
    );
  }

  /**
   * Generate a signed URL for a file in Supabase storage
   */
  private async generateSignedUrl(storagePath: string): Promise<string> {
    try {
      // Import the Supabase client
      const { supabase } = await import('../database/utils');

      // Get the current user to create a user-specific folder
      const { getUser } = await import('@/lib/auth');
      const user = await getUser();

      if (!user) {
        console.error('[DEBUG] User not authenticated. Cannot generate signed URL.');
        return '';
      }

      // Create a user-specific path
      const userPath = `${user.id}/${storagePath}`;

      // Create a signed URL that expires in 24 hours (86400 seconds)
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .createSignedUrl(userPath, 86400);

      if (error || !data?.signedUrl) {
        console.error('[DEBUG] Error generating signed URL:', error);
        return '';
      }

      return data.signedUrl;
    } catch (error) {
      console.error('[DEBUG] Exception in generateSignedUrl:', error);
      return '';
    }
  }

  /**
   * Upload a file to Supabase storage
   * Uses the old path structure with documentId/migrated_1.extension for compatibility
   */
  private async uploadFileToStorage(file: File, storagePath: string): Promise<{ data: unknown, error: unknown }> {
    console.log('[DEBUG] uploadFileToStorage called with file:', file.name, 'storagePath:', storagePath);

    try {
      // Import the Supabase client
      const { supabase } = await import('../database/utils');

      // Get the current user to create a user-specific folder
      const { getUser } = await import('@/lib/auth');
      const user = await getUser();

      if (!user) {
        console.error('[DEBUG] User not authenticated. Cannot upload file.');
        return { data: null, error: { message: 'User not authenticated' } };
      }

      // Create a user-specific path
      // The storagePath should already be in the format: documentId/migrated_1.extension
      const userPath = `${user.id}/${storagePath}`;

      // Upload the file to Supabase storage
      console.log('[DEBUG] Uploading file to Supabase storage:', userPath);
      const { data, error } = await supabase
        .storage
        .from('ocr-documents') // Use the correct bucket name from database_bucket_15-04-25.md
        .upload(userPath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error('[DEBUG] Error uploading file to Supabase storage:', error);
        return { data: null, error };
      }

      console.log('[DEBUG] File uploaded successfully to Supabase storage');
      return { data, error: null };
    } catch (error) {
      console.error('[DEBUG] Exception in uploadFileToStorage:', error);
      return { data: null, error };
    }
  }
}