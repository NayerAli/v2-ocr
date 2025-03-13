import type { ProcessingStatus, OCRResult } from "@/types";
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import * as apiService from "./api-service";
import { db } from "@/lib/indexed-db";

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
          const { id, status } = await apiService.uploadFile(file);
          
          // Save the initial status to the local database
          await db.saveToQueue(status);
          
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
        
        if (success) {
          // Get the current status from the local database
          const queue = await db.getQueue();
          const currentStatus = queue.find(item => item.id === id);
          
          if (currentStatus) {
            // Update the status to cancelled
            const updatedStatus: ProcessingStatus = {
              ...currentStatus,
              status: 'cancelled',
              endTime: Date.now(),
              updatedAt: new Date()
            };
            
            // Save the updated status to the local database
            await db.saveToQueue(updatedStatus);
          }
        }
        
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
        // First, try to get the status from the server
        const serverStatus = await apiService.getProcessingStatus(id);
        
        // Save the status to the local database
        await db.saveToQueue(serverStatus);
        
        return serverStatus;
      } catch (error) {
        console.error("Error getting status from server:", error);
        
        // If we can't get the status from the server, try to get it from the local database
        try {
          const queue = await db.getQueue();
          return queue.find(item => item.id === id);
        } catch (dbError) {
          console.error("Error getting status from local database:", dbError);
          return undefined;
        }
      }
    },
    
    /**
     * Get the status of all processing items
     */
    getAllStatus: async (): Promise<ProcessingStatus[]> => {
      try {
        // Get all items from the local database
        const queue = await db.getQueue();
        
        // Update the status of processing items
        const updatedQueue = await Promise.all(
          queue.map(async (item) => {
            if (item.status === "processing" || item.status === "queued") {
              try {
                const serverStatus = await apiService.getProcessingStatus(item.id);
                
                // Save the updated status to the local database
                await db.saveToQueue(serverStatus);
                
                return serverStatus;
              } catch (error) {
                console.error(`Error getting status for ${item.id}:`, error);
                return item;
              }
            }
            return item;
          })
        );
        
        return updatedQueue.filter((item): item is ProcessingStatus => !!item);
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
        const results = await apiService.getResults(id);
        
        // Save results to the local database
        await db.saveResults(id, results);
        
        return results;
      } catch (error) {
        console.error("Error getting results from server:", error);
        
        // If we can't get the results from the server, try to get them from the local database
        try {
          return await db.getResults(id);
        } catch (dbError) {
          console.error("Error getting results from local database:", dbError);
          throw error;
        }
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