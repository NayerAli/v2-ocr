import type { ProcessingStatus } from "@/types";
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import { AzureRateLimiter } from "./rate-limiter";
import { createOCRProviderWithLatestSettings } from "./providers";
import { FileProcessor } from "./file-processor";
import { QueueManager } from "./queue-manager";
import { getServerProcessingSettings } from "./server-settings";
import { userSettingsService } from "@/lib/user-settings-service";

interface ServiceSettings {
  ocr: OCRSettings;
  processing: ProcessingSettings;
  upload: UploadSettings;
}

interface ProcessingServiceState {
  queueManager: QueueManager;
  fileProcessor: FileProcessor;
  ocrSettings: OCRSettings;
  processingSettings: ProcessingSettings;
  uploadSettings: UploadSettings;
  azureRateLimiter: AzureRateLimiter;
}

// Private singleton state
let serviceState: ProcessingServiceState | null = null;

/**
 * Initialize the processing service components with the given settings
 */
async function initializeService(state: ProcessingServiceState): Promise<void> {
  console.log('[DEBUG] Initializing processing service');
  console.log('[DEBUG] Initial OCR settings:', state.ocrSettings);
  console.log('[DEBUG] Initial processing settings:', state.processingSettings);

  // Try to load user-specific settings first
  try {
    console.log('[DEBUG] Fetching user-specific settings');
    // Clear the cache to ensure we get the latest settings
    userSettingsService.clearCache();

    const userOCRSettings = await userSettingsService.getOCRSettings();
    const userProcessingSettings = await userSettingsService.getProcessingSettings();
    const userUploadSettings = await userSettingsService.getUploadSettings();

    console.log('[DEBUG] User OCR settings:', userOCRSettings);
    console.log('[DEBUG] User processing settings:', userProcessingSettings);

    // Update the settings with user-specific values
    state.ocrSettings = userOCRSettings;
    state.processingSettings = userProcessingSettings;
    state.uploadSettings = userUploadSettings;

    // Create a new OCR provider with the latest user settings
    // This will always get the most up-to-date API key
    const ocrProvider = await createOCRProviderWithLatestSettings(userOCRSettings, state.azureRateLimiter);
    state.fileProcessor.updateOCRProvider(ocrProvider);

    // Update components that depend on processing settings
    state.fileProcessor.updateProcessingSettings(userProcessingSettings);
    state.queueManager.updateProcessingSettings(userProcessingSettings);
    state.queueManager.updateUploadSettings(userUploadSettings);

    console.log('[DEBUG] Updated components with user settings');
  } catch (error) {
    console.log('[DEBUG] Error fetching user settings:', error);

    // Fall back to server settings if user settings fail
    try {
      console.log('[DEBUG] Fetching server processing settings');
      const serverProcessingSettings = await getServerProcessingSettings();
      console.log('[DEBUG] Server processing settings:', serverProcessingSettings);

      // Update the processing settings with server-side values
      state.processingSettings = serverProcessingSettings;

      // Update components that depend on processing settings
      state.fileProcessor.updateProcessingSettings(serverProcessingSettings);
      state.queueManager.updateProcessingSettings(serverProcessingSettings);
      console.log('[DEBUG] Updated components with server settings');
    } catch (serverError) {
      console.log('[DEBUG] Error fetching server settings:', serverError);
      // Continue with existing settings if server fetch fails
    }
  }

  console.log('[DEBUG] Initializing queue');
  await state.queueManager.initializeQueue();
  console.log('[DEBUG] Queue initialized');

  // Check if we have a valid OCR provider with an API key
  const hasValidProvider = await state.fileProcessor.hasValidOCRProvider();

  if (hasValidProvider) {
    console.log('[DEBUG] Valid OCR provider found, processing queue');
    state.queueManager.processQueue();
  } else {
    console.log('[DEBUG] No valid OCR provider found, skipping queue processing');
    console.log('[DEBUG] OCR settings:', state.ocrSettings);
  }
}

/**
 * Create service components with the provided settings
 */
async function createServiceComponents(settings: ServiceSettings, rateLimiter: AzureRateLimiter): Promise<Omit<ProcessingServiceState, 'azureRateLimiter'>> {
  // Always get the latest OCR provider with up-to-date API key
  const ocrProvider = await createOCRProviderWithLatestSettings(settings.ocr, rateLimiter);
  const fileProcessor = new FileProcessor(settings.processing, ocrProvider);
  const queueManager = new QueueManager(
    settings.processing,
    settings.upload,
    fileProcessor
  );

  return {
    queueManager,
    fileProcessor,
    ocrSettings: settings.ocr,
    processingSettings: settings.processing,
    uploadSettings: settings.upload,
  };
}

/**
 * Get or create the processing service instance
 */
export async function getProcessingService(settings: ServiceSettings) {
  console.log('[DEBUG] getProcessingService called with settings:', settings);

  if (!serviceState) {
    console.log('[DEBUG] No existing service state, creating new instance');
    const azureRateLimiter = new AzureRateLimiter();

    // Create components asynchronously to get the latest API key
    const components = await createServiceComponents(settings, azureRateLimiter);

    serviceState = {
      azureRateLimiter,
      ...components
    };

    // Initialize asynchronously
    console.log('[DEBUG] Initializing service asynchronously');
    initializeService(serviceState).catch(err => {
      console.error('[DEBUG] Processing service initialization error:', err);
    });
  } else if (
    JSON.stringify(serviceState.ocrSettings) !== JSON.stringify(settings.ocr) ||
    JSON.stringify(serviceState.processingSettings) !== JSON.stringify(settings.processing) ||
    JSON.stringify(serviceState.uploadSettings) !== JSON.stringify(settings.upload)
  ) {
    console.log('[DEBUG] Settings changed, updating service');
    console.log('[DEBUG] Old OCR settings:', serviceState.ocrSettings);
    console.log('[DEBUG] New OCR settings:', settings.ocr);

    // Update settings if they've changed
    // Create components asynchronously to get the latest API key
    const components = await createServiceComponents(settings, serviceState.azureRateLimiter);

    // Store the old queue manager to handle in-flight jobs
    const oldQueueManager = serviceState.queueManager;

    // Update the service state with new components
    serviceState = {
      ...components,
      azureRateLimiter: serviceState.azureRateLimiter
    };

    // Handle in-flight jobs - cancel and requeue them with the new API key
    try {
      console.log('[DEBUG] Handling in-flight jobs with updated API key');
      // Pause the old queue to stop processing
      await oldQueueManager.pauseQueue();

      // Get all processing items
      const allStatus = await oldQueueManager.getAllStatus();
      const processingItems = allStatus.filter(item => item.status === "processing");

      if (processingItems.length > 0) {
        console.log(`[DEBUG] Found ${processingItems.length} in-flight jobs to restart with new API key`);

        // Cancel all processing items in the old queue
        for (const item of processingItems) {
          await oldQueueManager.cancelProcessing(item.id);

          // Update status to queued in the new queue manager
          const updatedItem = await serviceState.queueManager.getStatus(item.id);
          if (updatedItem) {
            updatedItem.status = "queued";
            updatedItem.error = undefined;
            // Save the updated status
            await serviceState.queueManager.updateItemStatus(updatedItem);
          }
        }

        // Start processing the queue with the new API key
        serviceState.queueManager.processQueue();
      }
    } catch (error) {
      console.error('[DEBUG] Error handling in-flight jobs:', error);
    }

    // Initialize with new settings
    console.log('[DEBUG] Reinitializing service with new settings');
    initializeService(serviceState).catch(err => {
      console.error('[DEBUG] Processing service reinitialization error:', err);
    });
  } else {
    console.log('[DEBUG] Using existing service instance, settings unchanged');

    // Even if settings haven't changed, refresh the OCR provider to ensure it has the latest API key
    try {
      console.log('[DEBUG] Refreshing OCR provider with latest API key');
      const ocrProvider = await createOCRProviderWithLatestSettings(serviceState.ocrSettings, serviceState.azureRateLimiter);
      serviceState.fileProcessor.updateOCRProvider(ocrProvider);
    } catch (error) {
      console.error('[DEBUG] Error refreshing OCR provider:', error);
    }
  }

  // Return the public API
  return {
    /**
     * Add files to the processing queue
     */
    addToQueue: async (files: File[]): Promise<string[]> => {
      console.log('[DEBUG] Processing service addToQueue called with', files.length, 'files');

      if (!serviceState) {
        console.log('[DEBUG] Service not initialized');
        throw new Error('Service not initialized');
      }

      console.log('[DEBUG] Calling queueManager.addToQueue');
      const ids = await serviceState.queueManager.addToQueue(files);
      console.log('[DEBUG] queueManager.addToQueue returned IDs:', ids);

      // Check if we have a valid OCR provider with an API key
      const hasValidProvider = await serviceState.fileProcessor.hasValidOCRProvider();

      if (hasValidProvider) {
        console.log('[DEBUG] Valid OCR provider found, calling processQueue');
        serviceState.queueManager.processQueue();
      } else {
        console.log('[DEBUG] No valid OCR provider found, skipping processQueue');
        console.log('[DEBUG] OCR settings:', serviceState.ocrSettings);
      }

      return ids;
    },

    /**
     * Pause the processing queue
     */
    pauseQueue: async () => {
      if (!serviceState) throw new Error('Service not initialized');
      return serviceState.queueManager.pauseQueue();
    },

    /**
     * Resume the processing queue
     */
    resumeQueue: async () => {
      if (!serviceState) throw new Error('Service not initialized');
      return serviceState.queueManager.resumeQueue();
    },

    /**
     * Cancel processing for a specific item
     */
    cancelProcessing: async (id: string) => {
      if (!serviceState) throw new Error('Service not initialized');
      return serviceState.queueManager.cancelProcessing(id);
    },

    /**
     * Get the status of a specific processing item
     */
    getStatus: async (id: string): Promise<ProcessingStatus | undefined> => {
      if (!serviceState) throw new Error('Service not initialized');
      return serviceState.queueManager.getStatus(id);
    },

    /**
     * Get the status of all processing items
     */
    getAllStatus: async (): Promise<ProcessingStatus[]> => {
      if (!serviceState) throw new Error('Service not initialized');
      return serviceState.queueManager.getAllStatus();
    },

    /**
     * Retry a failed document
     */
    retryDocument: async (id: string): Promise<ProcessingStatus | null> => {
      if (!serviceState) throw new Error('Service not initialized');
      console.log('[DEBUG] Processing service retryDocument called for ID:', id);
      return serviceState.queueManager.retryDocument(id);
    },

    /**
     * Update service settings
     */
    updateSettings: async (newSettings: ServiceSettings): Promise<void> => {
      if (!serviceState) throw new Error('Service not initialized');

      console.log('[ProcessingService] Updating settings:', newSettings);

      // Create components asynchronously to get the latest API key
      const components = await createServiceComponents(newSettings, serviceState.azureRateLimiter);

      // Store the old queue manager to handle in-flight jobs
      const oldQueueManager = serviceState.queueManager;

      // Update the service state with new components
      serviceState = {
        ...components,
        azureRateLimiter: serviceState.azureRateLimiter
      };

      // Handle in-flight jobs - cancel and requeue them with the new API key
      try {
        console.log('[DEBUG] Handling in-flight jobs with updated API key');
        // Pause the old queue to stop processing
        await oldQueueManager.pauseQueue();

        // Get all processing items
        const allStatus = await oldQueueManager.getAllStatus();
        const processingItems = allStatus.filter(item => item.status === "processing");

        if (processingItems.length > 0) {
          console.log(`[DEBUG] Found ${processingItems.length} in-flight jobs to restart with new API key`);

          // Cancel all processing items in the old queue
          for (const item of processingItems) {
            await oldQueueManager.cancelProcessing(item.id);

            // Update status to queued in the new queue manager
            const updatedItem = await serviceState.queueManager.getStatus(item.id);
            if (updatedItem) {
              updatedItem.status = "queued";
              updatedItem.error = undefined; // Clear the error field
              // Save the updated status
              await serviceState.queueManager.updateItemStatus(updatedItem);
            }
          }

          // Start processing the queue with the new API key
          serviceState.queueManager.processQueue();
        }
      } catch (error) {
        console.error('[DEBUG] Error handling in-flight jobs:', error);
      }

      // Initialize with new settings
      initializeService(serviceState).catch(err =>
        console.error('[ProcessingService] Settings update error:', err)
      );
    }
  };
}