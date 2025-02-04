import { create } from "zustand"
import { persist } from "zustand/middleware"
import { CONFIG } from "@/config/constants"
import type { SettingsState, OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings, DatabaseSettings } from "@/types/settings"

const defaultSettings: Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'resetSettings'> = {
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
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "pdf-ocr-settings",
      version: 1,
    },
  ),
)

