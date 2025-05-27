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
   * Load the latest processing settings from the user settings service
   * This ensures we always have the most up-to-date settings
   */
  private async loadSettings(): Promise<void> {
    const { userSettingsService } = await import('@/lib/user-settings-service');
    this.processingSettings = await userSettingsService.getProcessingSettings();
    this.fileProcessor.updateProcessingSettings(this.processingSettings);
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
    // Use infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');

    infoLog('[DEBUG] addToQueue called with', files.length, 'files');
    const ids: string[] = [];

    for (const file of files) {
      infoLog('[DEBUG] Processing file:', file.name, 'type:', file.type, 'size:', file.size);

      if (!this.isFileValid(file)) {
        infoLog('[DEBUG] Invalid file:', file.name);
        throw new Error(`Invalid file: ${file.name}`);
      }

      const id = crypto.randomUUID();
      const now = new Date();

      // Generate a storage path for the file using the new naming convention
      const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
      let storagePath;

      // Use the appropriate naming convention based on file type
      if (file.type.startsWith('image/')) {
        // For images: Image_(ID).(extension)
        storagePath = `${id}/Image_${id}${fileExtension}`;
      } else if (file.type === 'application/pdf') {
        // For PDFs: PDF_(ID).pdf
        storagePath = `${id}/PDF_${id}.pdf`;
      } else {
        // For other file types, use a generic naming convention
        storagePath = `${id}/File_${id}${fileExtension}`;
      }

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
        storagePath: storagePath,
        file,
        createdAt: now,
        updatedAt: now
      };

      infoLog('[DEBUG] Adding file to queue:', file.name, 'with ID:', id);

      // Upload file to Supabase storage
      try {
        infoLog('[DEBUG] Uploading file to storage:', file.name);
        // We only care about the error, not the data
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { data: uploadData, error: uploadError } = await this.uploadFileToStorage(file, storagePath);

        if (uploadError) {
          infoLog('[DEBUG] Error uploading file to storage:', uploadError);
          const errorMessage = typeof uploadError === 'object' && uploadError !== null && 'message' in uploadError
            ? uploadError.message
            : 'Unknown error';
          throw new Error(`Failed to upload file: ${errorMessage}`);
        }

        infoLog('[DEBUG] File uploaded successfully to storage');
      } catch (error) {
        infoLog('[DEBUG] Exception uploading file to storage:', error);
        throw new Error('Failed to upload file to storage');
      }

      this.queueMap.set(id, status);
      await db.saveToQueue(status);
      ids.push(id);
      infoLog('[DEBUG] File added to queue:', file.name, 'with ID:', id);
    }

    infoLog('[DEBUG] Added', ids.length, 'files to queue with IDs:', ids);

    return ids;
  }

  async processQueue() {
    // Load the latest settings before processing
    await this.loadSettings();

    // Use infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');

    infoLog('[DEBUG] processQueue called, isProcessing:', this.isProcessing, 'isPaused:', this.isPaused);

    // Check if we have a valid OCR provider
    if (!await this.fileProcessor.hasValidOCRProvider()) {
      infoLog('[DEBUG] No valid OCR provider available, cannot process queue');
      return;
    }

    if (this.isProcessing || this.isPaused) {
      infoLog('[DEBUG] Queue already processing or paused, returning');
      return;
    }

    this.isProcessing = true;
    infoLog('[DEBUG] Setting isProcessing to true');

    try {
      const allItems = Array.from(this.queueMap.values());
      infoLog('[DEBUG] All items in queue:', allItems.length);

      const queuedItems = allItems
        .filter(item => item.status === "queued");

      infoLog('[DEBUG] Queued items:', queuedItems.length);

      // Get the effective concurrent jobs limit
      const maxConcurrentJobs = this.processingSettings.maxConcurrentJobs || 1;

      // Apply the effective limit
      const itemsToProcess = queuedItems.slice(0, maxConcurrentJobs);
      infoLog('[DEBUG] Items to process:', itemsToProcess.length, 'maxConcurrentJobs:', maxConcurrentJobs);

      const processingPromises = itemsToProcess.map(async (item) => {
        try {
          // Create abort controller for this item
          const controller = new AbortController();
          this.abortControllers.set(item.id, controller);

          // Update status to processing
          infoLog(`[DEBUG] Setting document ${item.id} status to processing`);

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
            infoLog(`[Process] Processing cancelled for ${item.filename}`);
            return;
          }

          // Results should already be saved individually by the file processor
          // Just log the completion
          infoLog(`[Process] All ${results.length} results processed for ${item.filename}`);

          // Update final progress to 100%
          item.progress = 100;
          await db.saveToQueue(item);

          // Update status to completed
          infoLog(`[DEBUG] Setting document ${item.id} status to completed`);

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
          infoLog(`Error processing ${item.filename}:`, error);

          if (error instanceof Error && (
            error.name === "AbortError" ||
            error.message === "Processing aborted"
          )) {
            infoLog(`[Process] Processing aborted for ${item.filename}`);
            return;
          }

          // Update status to error
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          infoLog(`[DEBUG] Setting document ${item.id} status to error: ${errorMessage}`);

          // Use the utility function to update the document status
          const updatedItem = await updateDocumentStatus(item, "error", errorMessage);

          // Update additional fields
          updatedItem.processingCompletedAt = new Date();

          // Make sure the item is in the queue map
          this.queueMap.set(item.id, updatedItem);

          // Clean up abort controller
          this.abortControllers.delete(item.id);

          infoLog(`[DEBUG] Document ${item.id} (${item.filename}) marked as error: ${item.error}`);
        }
      });

      await Promise.all(processingPromises);
    } catch (error) {
      infoLog("Queue processing error:", error);
    }

    this.isProcessing = false;
    infoLog('[DEBUG] Setting isProcessing to false');

    // Check if there are more items to process
    const remainingItems = Array.from(this.queueMap.values())
      .filter(item => item.status === "queued");
    infoLog('[DEBUG] Remaining queued items:', remainingItems.length);

    if (remainingItems.length > 0 && !this.isPaused) {
      infoLog('[DEBUG] More items to process, scheduling next processQueue call');
      // Use setTimeout to prevent stack overflow with recursive calls
      setTimeout(() => this.processQueue(), 0);
    } else {
      infoLog('[DEBUG] No more items to process or queue is paused');
    }
  }

  async pauseQueue() {
    // Use infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');

    infoLog('[DEBUG] QueueManager.pauseQueue called');
    this.isPaused = true;

    if (this.abortControllers.size > 0) {
      Array.from(this.abortControllers.values()).forEach(controller => controller.abort());
      this.abortControllers.clear();
    }

    // Save current state to IndexedDB
    for (const status of Array.from(this.queueMap.values())) {
      if (status.status === "processing") {
        infoLog(`[DEBUG] Changing processing document ${status.id} to queued`);
        // Use the utility function to update the document status
        const updatedStatus = await updateDocumentStatus(status, "queued");
        // Update the queue map
        this.queueMap.set(status.id, updatedStatus);
      }
    }

    infoLog('[DEBUG] Queue paused successfully');
  }

  async resumeQueue() {
    this.isPaused = false;
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async cancelProcessing(id: string) {
    // Use infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');

    infoLog(`[DEBUG] QueueManager.cancelProcessing called for ${id}`);

    const status = this.queueMap.get(id);
    if (!status) {
      infoLog(`[DEBUG] Document ${id} not found in queue map, cannot cancel`);
      return;
    }

    // Abort processing if in progress
    const controller = this.abortControllers.get(id);
    if (controller) {
      infoLog(`[DEBUG] Aborting processing for document ${id}`);
      controller.abort();
      this.abortControllers.delete(id);
    }

    // Update status and cleanup
    infoLog(`[DEBUG] Updating document ${id} status to cancelled`);

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

    infoLog(`[DEBUG] Document ${id} cancelled successfully`);

    // If this was the only processing item, reset processing state
    const processingItems = Array.from(this.queueMap.values()).filter(
      item => item.status === "processing"
    );
    if (processingItems.length === 0) {
      infoLog(`[DEBUG] No more processing items, resetting isProcessing to false`);
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
    // Use infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');

    infoLog(`[DEBUG] QueueManager.updateItemStatus called for ${item.id} with status ${item.status}`);

    // Use the utility function to update the document status
    const updatedItem = await updateDocumentStatus(item, item.status, item.error || undefined);

    // Update the item in the queue map
    this.queueMap.set(item.id, updatedItem);

    infoLog(`[DEBUG] Updated status for item ${item.id} to ${item.status}`);
  }

  /**
   * Retry a failed document
   * This is used when a document has failed and we want to retry it
   */
  async retryDocument(id: string): Promise<ProcessingStatus | null> {
    // Use infoLog for consistent logging
    const { infoLog } = await import('@/lib/log');

    infoLog(`[DEBUG] QueueManager.retryDocument called for ${id}`);

    // Get the document from the queue map or database
    let document = this.queueMap.get(id);

    if (!document) {
      infoLog(`[DEBUG] Document ${id} not found in queue map, fetching from database`);
      const queue = await db.getQueue();
      document = queue.find(item => item.id === id);

      if (!document) {
        infoLog(`[DEBUG] Document ${id} not found in database`);
        return null;
      }
    }

    // Use the utility function to retry the document
    const retryResult = await retryDocumentUtil(id);

    if (!retryResult) {
      infoLog(`[DEBUG] Failed to retry document ${id}`);
      return null;
    }

    // Update the queue map with the retried document
    this.queueMap.set(id, retryResult);

    // Start processing the queue if not already processing
    if (!this.isProcessing && !this.isPaused) {
      infoLog(`[DEBUG] Starting queue processing for retried document`);
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

  // This method is kept for reference but not used directly anymore
  // File processor now handles signed URL generation
  /*
  private async generateSignedUrl(storagePath: string): Promise<string> {
    const { infoLog } = await import('@/lib/log');
    try {
      // Import the Supabase client
      const { supabase } = await import('../database/utils');

      // Get the current user to create a user-specific folder
      const { getUser } = await import('@/lib/auth');
      const user = await getUser();

      if (!user) {
        infoLog('[DEBUG] User not authenticated. Cannot generate signed URL.');
        return '';
      }

      // Create a user-specific path
      const userPath = `${user.id}/${storagePath}`;

      // Create a signed URL that expires in 24 hours (86400 seconds)
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .createSignedUrl(userPath, 86400);

      if (error || !data?.signedUrl) {
        infoLog('[DEBUG] Error generating signed URL:', error);
        return '';
      }

      return data.signedUrl;
    } catch (error) {
      infoLog('[DEBUG] Exception in generateSignedUrl:', error);
      return '';
    }
  }
  */

  /**
   * Upload a file to Supabase storage
   * Uses the new naming convention:
   * - For images: Image_(ID).(extension)
   * - For PDFs: PDF_(ID).pdf
   * - For other files: File_(ID).(extension)
   */
  private async uploadFileToStorage(file: File, storagePath: string): Promise<{ data: unknown, error: unknown }> {
    const { infoLog } = await import('@/lib/log');
    infoLog('[DEBUG] uploadFileToStorage called with file:', file.name, 'storagePath:', storagePath);

    try {
      // Import the Supabase client
      const { supabase } = await import('../database/utils');

      // Get the current user to create a user-specific folder
      const { getUser } = await import('@/lib/auth');
      const user = await getUser();

      if (!user) {
        infoLog('[DEBUG] User not authenticated. Cannot upload file.');
        return { data: null, error: { message: 'User not authenticated' } };
      }

      // Create a user-specific path
      // The storagePath should be in the format: documentId/[Image|PDF|File]_ID.extension
      const userPath = `${user.id}/${storagePath}`;

      // Upload the file to Supabase storage
      infoLog('[DEBUG] Uploading file to Supabase storage:', userPath);
      const { data, error } = await supabase
        .storage
        .from('ocr-documents') // Use the correct bucket name from database_bucket_15-04-25.md
        .upload(userPath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        infoLog('[DEBUG] Error uploading file to Supabase storage:', error);
        return { data: null, error };
      }

      infoLog('[DEBUG] File uploaded successfully to Supabase storage');
      return { data, error: null };
    } catch (error) {
      infoLog('[DEBUG] Exception in uploadFileToStorage:', error);
      return { data: null, error };
    }
  }
}