import type { ProcessingStatus } from "@/types";
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import { AzureRateLimiter } from "./rate-limiter";
import { createOCRProvider } from "./providers";
import { FileProcessor } from "./file-processor";
import { QueueManager } from "./queue-manager";
import { getServerProcessingSettings } from "./server-settings";

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

  // Fetch the latest processing settings from the server
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
  } catch (error) {
    console.log('[DEBUG] Error fetching server settings:', error);
    // Continue with existing settings if server fetch fails
  }

  console.log('[DEBUG] Initializing queue');
  await state.queueManager.initializeQueue();
  console.log('[DEBUG] Queue initialized');

  // Check if we have a valid OCR provider with an API key
  const hasValidProvider = state.fileProcessor.hasValidOCRProvider();

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
function createServiceComponents(settings: ServiceSettings, rateLimiter: AzureRateLimiter): Omit<ProcessingServiceState, 'azureRateLimiter'> {
  const ocrProvider = createOCRProvider(settings.ocr, rateLimiter);
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
export function getProcessingService(settings: ServiceSettings) {
  console.log('[DEBUG] getProcessingService called with settings:', settings);

  if (!serviceState) {
    console.log('[DEBUG] No existing service state, creating new instance');
    const azureRateLimiter = new AzureRateLimiter();
    serviceState = {
      azureRateLimiter,
      ...createServiceComponents(settings, azureRateLimiter)
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
    const components = createServiceComponents(settings, serviceState.azureRateLimiter);
    serviceState = {
      ...components,
      azureRateLimiter: serviceState.azureRateLimiter
    };

    // Initialize with new settings
    console.log('[DEBUG] Reinitializing service with new settings');
    initializeService(serviceState).catch(err => {
      console.error('[DEBUG] Processing service reinitialization error:', err);
    });
  } else {
    console.log('[DEBUG] Using existing service instance, settings unchanged');
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
      const hasValidProvider = serviceState.fileProcessor.hasValidOCRProvider();

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
     * Update service settings
     */
    updateSettings: (newSettings: ServiceSettings): void => {
      if (!serviceState) throw new Error('Service not initialized');

      console.log('[ProcessingService] Updating settings:', newSettings);

      const components = createServiceComponents(newSettings, serviceState.azureRateLimiter);
      serviceState = {
        ...components,
        azureRateLimiter: serviceState.azureRateLimiter
      };

      // Initialize with new settings
      initializeService(serviceState).catch(err =>
        console.error('[ProcessingService] Settings update error:', err)
      );
    }
  };
}