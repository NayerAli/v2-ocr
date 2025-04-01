import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { CONFIG } from "@/config/constants"
import type { SettingsState, OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings, DatabaseSettings } from "@/types/settings"
import { getDatabaseService, getActiveProvider } from "@/lib/db-factory"
import type { DatabaseProvider } from "@/lib/db-factory"

const SETTINGS_KEY = "user-settings"

const defaultSettings: Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings' | 'syncSettings'> = {
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
    preferredProvider: 'local',
    autoCleanup: false,
    cleanupThreshold: 90, // 90 days
    retentionPeriod: 30, // 30 days
    maxStorageSize: 1000, // 1GB
    connectionStatus: 'untested' // Default connection status
  },
  export: {
    format: 'txt' as const,
    naming: '{filename}-{timestamp}'
  }
}

// Custom storage adapter that syncs with Supabase when possible
const createCustomStorage = () => {
  const getItem = async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    
    try {
      // First try to get from localStorage
      const localData = localStorage.getItem(name);
      
      // Check if Supabase is actually available and configured
      const isSupabaseAvailable = (() => {
        try {
          // This is a dynamic check without importing to avoid circular deps
          return typeof window !== 'undefined' && 
            process.env.NEXT_PUBLIC_SUPABASE_URL && 
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        } catch (e) {
          return false;
        }
      })();
      
      // If Supabase is not available, don't even try to use it
      if (!isSupabaseAvailable) {
        return localData;
      }
      
      // If database provider is Supabase, try to get settings from there
      const settings = localData 
        ? JSON.parse(localData).state.database 
        : defaultSettings.database;
        
      if (getActiveProvider(settings) === 'supabase') {
        try {
          const db = getDatabaseService('supabase');
          if (db.getSettings) {
            const remoteSettings = await db.getSettings(SETTINGS_KEY);
            
            if (remoteSettings) {
              // If remote settings exist, use them (they're more up-to-date)
              console.log("[Settings] Retrieved from Supabase");
              return JSON.stringify({ state: remoteSettings });
            }
          } else {
            console.warn("[Settings] Supabase provider does not support getSettings");
          }
        } catch (supabaseError) {
          // Log the error but don't fail - fall back to local storage
          console.error("[Settings] Error fetching from Supabase:", supabaseError);
        }
      }
      
      return localData;
    } catch (error) {
      console.error("[Settings] Error getting settings:", error);
      return null;
    }
  };
  
  const setItem = async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    
    try {
      // Always save to localStorage first
      localStorage.setItem(name, value);
      
      // Then try to save to Supabase if that's the active provider
      const parsed = JSON.parse(value);
      const settings = parsed.state;
      
      if (getActiveProvider(settings.database) === 'supabase') {
        try {
          const db = getDatabaseService('supabase');
          if (db.saveSettings) {
            await db.saveSettings(SETTINGS_KEY, settings);
            console.log("[Settings] Saved to Supabase");
          } else {
            console.warn("[Settings] Supabase provider does not support saveSettings");
          }
        } catch (supabaseError) {
          // Log the error but don't fail - localStorage save already happened
          console.error("[Settings] Error saving to Supabase:", supabaseError);
        }
      }
    } catch (error) {
      console.error("[Settings] Error saving settings:", error);
      // Fallback to just local storage if parsing failed
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          console.error("[Settings] Final fallback for saving settings failed:", e);
        }
      }
    }
  };
  
  const removeItem = (name: string): void => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(name);
      // Note: We don't remove from Supabase as settings are persistent
    } catch (error) {
      console.error(`[Settings] Error removing item ${name}:`, error);
    }
  };

  return {
    getItem,
    setItem,
    removeItem
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      updateOCRSettings: (settings) => set((state) => ({ ocr: { ...state.ocr, ...settings } })),
      updateProcessingSettings: (settings) => set((state) => ({ processing: { ...state.processing, ...settings } })),
      updateUploadSettings: (settings) => set((state) => ({ upload: { ...state.upload, ...settings } })),
      updateDisplaySettings: (settings) => set((state) => ({ display: { ...state.display, ...settings } })),
      updateDatabaseSettings: (settings) => set((state) => ({ database: { ...state.database, ...settings } })),
      updateExportSettings: (settings) => set((state) => ({ export: { ...state.export, ...settings } })),
      resetSettings: () => set(defaultSettings),
      syncSettings: async () => {
        try {
          const state = get()
          // Only sync if Supabase is the active provider
          if (getActiveProvider(state.database) === 'supabase') {
            const db = getDatabaseService('supabase')
            if (db.saveSettings) {
              await db.saveSettings(SETTINGS_KEY, {
                ocr: state.ocr,
                processing: state.processing,
                upload: state.upload,
                display: state.display,
                database: state.database,
                export: state.export
              })
              console.log("[Settings] Manually synced with Supabase")
              return true
            } else {
              console.warn("[Settings] Supabase provider does not support saveSettings")
              return false
            }
          }
          return false
        } catch (error) {
          console.error("[Settings] Error syncing settings:", error)
          return false
        }
      }
    }),
    {
      name: "pdf-ocr-settings",
      version: 1,
      storage: createJSONStorage(() => createCustomStorage()),
      skipHydration: false,
      onRehydrateStorage: () => {
        // Return a handler that will be called after rehydration
        return (state) => {
          if (state) {
            // Ensure all required fields exist after rehydration
            const hasAllFields = state.ocr && state.processing && state.upload && 
                               state.display && state.database
            if (!hasAllFields) {
              // Reset to defaults if any required field is missing
              state.resetSettings()
            }
          }
        }
      }
    },
  ),
)

