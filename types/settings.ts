export interface OCRSettings {
  // OCR Tab
  provider: 'google' | 'microsoft' | 'mistral'
  apiKey: string
  region?: string
  language?: string
}

export interface ProcessingSettings {
  maxConcurrentJobs: number
  pagesPerChunk: number
  concurrentChunks: number
  retryAttempts: number
  retryDelay: number
}

export interface UploadSettings {
  maxFileSize: number
  allowedFileTypes: string[]
  maxSimultaneousUploads: number
}

export interface DisplaySettings {
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  showConfidenceScores: boolean
  highlightUncertain: boolean
}

export interface DatabaseStats {
  totalDocuments: number
  totalResults: number
  dbSize: number
  lastCleared?: Date
}

export interface DatabaseSettings {
  autoCleanup: boolean
  cleanupThreshold: number // in days
  retentionPeriod: number // in days
  maxStorageSize: number // in MB
}

export interface ExportSettings {
  format: 'txt' | 'json' | 'csv'
  naming: string
}

export interface SettingsState {
  // Settings data
  ocr: OCRSettings
  processing: ProcessingSettings
  upload: UploadSettings
  display: DisplaySettings
  database: DatabaseSettings
  export: ExportSettings

  // Loading and error states
  isLoading: boolean
  error: Error | null

  // Update functions
  updateOCRSettings: (settings: Partial<OCRSettings>) => Promise<void>
  updateProcessingSettings: (settings: Partial<ProcessingSettings>) => Promise<void>
  updateUploadSettings: (settings: Partial<UploadSettings>) => Promise<void>
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => Promise<void>
  updateDatabaseSettings: (settings: Partial<DatabaseSettings>) => Promise<void>
  updateExportSettings: (settings: Partial<ExportSettings>) => Promise<void>
  resetSettings: () => Promise<void>

  // Initialization
  initialize: () => Promise<void>
}