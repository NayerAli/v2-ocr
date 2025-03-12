import type { ProcessingStatus } from "@/types";
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import { AzureRateLimiter } from "./rate-limiter";
import { createOCRProvider } from "./providers";
import { FileProcessor } from "./file-processor";
import { QueueManager } from "./queue-manager";

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
  await state.queueManager.initializeQueue();
  
  if (state.ocrSettings.apiKey) {
    state.queueManager.processQueue();
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
  if (!serviceState) {
    const azureRateLimiter = new AzureRateLimiter();
    serviceState = {
      azureRateLimiter,
      ...createServiceComponents(settings, azureRateLimiter)
    };
    
    // Initialize asynchronously
    initializeService(serviceState).catch(err => 
      console.error('[ProcessingService] Initialization error:', err)
    );
  } else if (
    JSON.stringify(serviceState.ocrSettings) !== JSON.stringify(settings.ocr) ||
    JSON.stringify(serviceState.processingSettings) !== JSON.stringify(settings.processing) ||
    JSON.stringify(serviceState.uploadSettings) !== JSON.stringify(settings.upload)
  ) {
    // Update settings if they've changed
    const components = createServiceComponents(settings, serviceState.azureRateLimiter);
    serviceState = {
      ...components,
      azureRateLimiter: serviceState.azureRateLimiter
    };
    
    // Initialize with new settings
    initializeService(serviceState).catch(err => 
      console.error('[ProcessingService] Reinitialization error:', err)
    );
  }
  
  // Return the public API
  return {
    /**
     * Add files to the processing queue
     */
    addToQueue: async (files: File[]): Promise<string[]> => {
      if (!serviceState) throw new Error('Service not initialized');
      
      const ids = await serviceState.queueManager.addToQueue(files);
      
      if (serviceState.ocrSettings.apiKey) {
        serviceState.queueManager.processQueue();
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