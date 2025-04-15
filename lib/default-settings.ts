import type { OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings } from '@/types/settings'
import { CONFIG } from '@/config/constants'

// Default OCR settings
export const DEFAULT_OCR_SETTINGS: OCRSettings = {
  provider: "google" as const,
  apiKey: process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || "",
  region: "",
  language: CONFIG.DEFAULT_LANGUAGE,
  useSystemKey: true, // Flag to indicate using the system API key
}

// Default processing settings
export const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 1,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
}

// Default upload settings
export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxFileSize: 500,
  allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
  maxSimultaneousUploads: 5
}

// Default display settings
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  theme: 'system',
  fontSize: 14,
  showConfidenceScores: true,
  highlightUncertain: true
}

/**
 * Get default settings for all settings types
 */
export function getDefaultSettings() {
  return {
    ocr: DEFAULT_OCR_SETTINGS,
    processing: DEFAULT_PROCESSING_SETTINGS,
    upload: DEFAULT_UPLOAD_SETTINGS,
    display: DEFAULT_DISPLAY_SETTINGS
  }
}
