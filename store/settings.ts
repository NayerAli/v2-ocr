import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { CONFIG } from "@/config/constants"
import type { SettingsState, OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings, DatabaseSettings } from "@/types/settings"

const defaultSettings: Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'> = {
  ocr: {
    provider: "google" as const,
    apiKey: "",
    region: "",
    language: CONFIG.DEFAULT_LANGUAGE,
    useSystemKey: true, // Use system API key by default
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

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      updateOCRSettings: (settings) => set((state) => ({ ocr: { ...state.ocr, ...settings } })),
      updateProcessingSettings: (settings) => set((state) => ({ processing: { ...state.processing, ...settings } })),
      updateUploadSettings: (settings) => set((state) => ({ upload: { ...state.upload, ...settings } })),
      updateDisplaySettings: (settings) => set((state) => ({ display: { ...state.display, ...settings } })),
      updateDatabaseSettings: (settings) => set((state) => ({ database: { ...state.database, ...settings } })),
      updateExportSettings: (settings) => set((state) => ({ export: { ...state.export, ...settings } })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "pdf-ocr-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
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

