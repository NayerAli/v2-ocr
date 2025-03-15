import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { CONFIG } from "@/config/constants"
import type { SettingsState, OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings, DatabaseSettings, ExportSettings } from "@/types/settings"

// Track if we've already synced with the server
let hasSyncedWithServer = false;
let syncTimer: NodeJS.Timeout | null = null;
let pendingSync = false;

// Function to fetch settings from the server
async function fetchServerSettings() {
  try {
    const response = await fetch('/api/settings');
    if (!response.ok) {
      throw new Error('Failed to fetch settings');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching settings from server:', error);
    return null;
  }
}

// Function to update settings on the server with debounce
async function updateServerSettings(settings: any) {
  // Clear any existing timer
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  
  // Set a flag to indicate a sync is pending
  pendingSync = true;
  
  // Return a promise that will be resolved when the sync is complete
  return new Promise<any>((resolve) => {
    syncTimer = setTimeout(async () => {
      try {
        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(settings),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update settings');
        }
        
        const result = await response.json();
        pendingSync = false;
        resolve(result);
      } catch (error) {
        console.error('Error updating settings on server:', error);
        pendingSync = false;
        resolve(null);
      }
    }, 2000); // 2 second debounce
  });
}

// Function to reset settings on the server
async function resetServerSettings() {
  try {
    const response = await fetch('/api/settings', {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to reset settings');
    }
    return await response.json();
  } catch (error) {
    console.error('Error resetting settings on server:', error);
    return null;
  }
}

const defaultSettings: Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'> = {
  ocr: {
    provider: "google" as const,
    apiKey: "",
    region: "",
    language: CONFIG.DEFAULT_LANGUAGE,
  },
  processing: {
    maxConcurrentJobs: 1,
    pagesPerChunk: 2,
    concurrentChunks: 1,
    retryAttempts: 2,
    retryDelay: 1000
  },
  upload: {
    maxFileSize: 500,
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
    maxSimultaneousUploads: 5
  },
  display: {
    theme: 'system',
    fontSize: 14,
    showConfidenceScores: true,
    highlightUncertain: true
  },
  database: {
    autoCleanup: false,
    cleanupThreshold: 90, // 90 days
    retentionPeriod: 30, // 30 days
    maxStorageSize: 1000 // 1GB
  },
  export: {
    format: 'txt' as const,
    naming: '{filename}-{timestamp}'
  }
}

// Store for settings
export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      updateOCRSettings: async (settings) => {
        // Update local state immediately
        set((state) => ({ ocr: { ...state.ocr, ...settings } }));
        
        // If updating API key, sync with server immediately
        if (settings.apiKey !== undefined) {
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
          return;
        }
        
        // For other settings, use debounced sync
        if (!pendingSync) {
          // Sync with server
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
        }
      },
      updateProcessingSettings: async (settings) => {
        // Update local state immediately
        set((state) => ({ processing: { ...state.processing, ...settings } }));
        
        // Only sync with server if there's no pending sync
        if (!pendingSync) {
          // Sync with server
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
        }
      },
      updateUploadSettings: async (settings) => {
        // Update local state immediately
        set((state) => ({ upload: { ...state.upload, ...settings } }));
        
        // Only sync with server if there's no pending sync
        if (!pendingSync) {
          // Sync with server
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
        }
      },
      updateDisplaySettings: async (settings) => {
        // Update local state immediately
        set((state) => ({ display: { ...state.display, ...settings } }));
        
        // Only sync with server if there's no pending sync
        if (!pendingSync) {
          // Sync with server
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
        }
      },
      updateDatabaseSettings: async (settings) => {
        // Update local state immediately
        set((state) => ({ database: { ...state.database, ...settings } }));
        
        // Only sync with server if there's no pending sync
        if (!pendingSync) {
          // Sync with server
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
        }
      },
      updateExportSettings: async (settings) => {
        // Update local state immediately
        set((state) => ({ export: { ...state.export, ...settings } }));
        
        // Only sync with server if there's no pending sync
        if (!pendingSync) {
          // Sync with server
          const serverSettings = await updateServerSettings({ 
            ...get(),
            updateOCRSettings: undefined,
            updateProcessingSettings: undefined,
            updateUploadSettings: undefined,
            updateDisplaySettings: undefined,
            updateDatabaseSettings: undefined,
            updateExportSettings: undefined,
            resetSettings: undefined
          });
          
          if (serverSettings) {
            set(serverSettings);
          }
        }
      },
      resetSettings: async () => {
        set(defaultSettings);
        // Sync with server
        const serverSettings = await resetServerSettings();
        if (serverSettings) {
          set(serverSettings);
        }
      },
    }),
    {
      name: "pdf-ocr-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: false,
      onRehydrateStorage: () => {
        // Return a handler that will be called after rehydration
        return (rehydratedState) => {
          if (rehydratedState) {
            // Ensure all required fields exist after rehydration
            const hasAllFields = rehydratedState.ocr && 
                               rehydratedState.processing && 
                               rehydratedState.upload && 
                               rehydratedState.display && 
                               rehydratedState.database && 
                               rehydratedState.export;
            
            if (!hasAllFields) {
              // Reset to defaults if any required field is missing
              rehydratedState.resetSettings();
            } else if (!hasSyncedWithServer) {
              // Sync with server once after rehydration
              hasSyncedWithServer = true;
              
              // Use setTimeout to defer the API call until after hydration is complete
              setTimeout(async () => {
                try {
                  const serverSettings = await fetchServerSettings();
                  if (serverSettings) {
                    // Use the store's set function directly
                    useSettings.setState(serverSettings);
                  } else {
                    // If server fetch fails, update server with local settings
                    await updateServerSettings({
                      ...rehydratedState,
                      updateOCRSettings: undefined,
                      updateProcessingSettings: undefined,
                      updateUploadSettings: undefined,
                      updateDisplaySettings: undefined,
                      updateDatabaseSettings: undefined,
                      updateExportSettings: undefined,
                      resetSettings: undefined
                    });
                  }
                } catch (error) {
                  console.error('Error syncing with server:', error);
                }
              }, 1000);
            }
          }
        }
      }
    },
  ),
)

