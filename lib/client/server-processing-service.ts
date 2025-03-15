import type { ProcessingStatus, OCRResult } from "@/types";
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import * as apiService from "./api-service";
import { serverStorage } from "./server-storage-service";

interface ServiceSettings {
  ocr: OCRSettings;
  processing: ProcessingSettings;
  upload: UploadSettings;
}

/**
 * Get the server-based processing service
 */
export function getProcessingService(settings: ServiceSettings) {
  // Return the public API
  return {
    /**
     * Add files to the processing queue
     */
    addToQueue: async (files: File[]): Promise<string[]> => {
      const ids: string[] = [];
      
      // Process files one by one
      for (const file of files) {
        try {
          // Upload the file to the server
          const { id } = await apiService.uploadFile(file);
          ids.push(id);
        } catch (error) {
          console.error("Error uploading file:", error);
          throw error;
        }
      }
      
      return ids;
    },
    
    /**
     * Pause the processing queue
     */
    pauseQueue: async () => {
      // Not implemented for server-based processing
      console.warn("Pause queue not implemented for server-based processing");
      return true;
    },
    
    /**
     * Resume the processing queue
     */
    resumeQueue: async () => {
      // Not implemented for server-based processing
      console.warn("Resume queue not implemented for server-based processing");
      return true;
    },
    
    /**
     * Cancel processing for a specific item
     */
    cancelProcessing: async (id: string) => {
      try {
        const success = await apiService.cancelProcessing(id);
        return success;
      } catch (error) {
        console.error("Error cancelling processing:", error);
        throw error;
      }
    },
    
    /**
     * Get the status of a specific processing item
     */
    getStatus: async (id: string): Promise<ProcessingStatus | undefined> => {
      try {
        // Get the status from the server
        return await serverStorage.getStatus(id);
      } catch (error) {
        console.error("Error getting status from server:", error);
        return undefined;
      }
    },
    
    /**
     * Get the status of all processing items
     */
    getAllStatus: async (): Promise<ProcessingStatus[]> => {
      try {
        // Get all items from the server
        return await serverStorage.getQueue();
      } catch (error) {
        console.error("Error getting all status:", error);
        return [];
      }
    },
    
    /**
     * Get results for a document
     */
    getResults: async (id: string): Promise<OCRResult[]> => {
      try {
        // Get results from the server
        return await serverStorage.getResults(id);
      } catch (error) {
        console.error("Error getting results from server:", error);
        throw error;
      }
    },
    
    /**
     * Update service settings
     */
    updateSettings: (newSettings: ServiceSettings): void => {
      // Server settings are updated through the settings API
      console.log("Settings updated on client side");
    }
  };
} 