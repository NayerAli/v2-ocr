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
  // Supabase Storage specific stats
  storageSize?: number  // Total size of files in storage in MB
  storageFiles?: number  // Total number of files in storage
  storageBucket?: string  // Storage bucket name
  storageUsagePercent?: number  // Percentage of storage quota used
  storageQuota?: number  // Storage quota in MB if available
  storageGrowthRate?: number  // Estimated MB per day growth rate
  storageProvider?: 'local' | 'supabase'  // Current active storage provider
}

export interface DatabaseSettings {
  preferredProvider: 'local' | 'supabase'
  autoCleanup: boolean
  cleanupThreshold: number // in days
  retentionPeriod: number // in days
  maxStorageSize: number // in MB
  connectionStatus?: 'untested' | 'success' | 'error' // Track Supabase connection status
}

export interface ExportSettings {
  format: 'txt' | 'json' | 'csv'
  naming: string
}

export interface SettingsState {
  ocr: OCRSettings
  processing: ProcessingSettings
  upload: UploadSettings
  display: DisplaySettings
  database: DatabaseSettings
  export: ExportSettings
  updateOCRSettings: (settings: Partial<OCRSettings>) => void
  updateProcessingSettings: (settings: Partial<ProcessingSettings>) => void
  updateUploadSettings: (settings: Partial<UploadSettings>) => void
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => void
  updateDatabaseSettings: (settings: Partial<DatabaseSettings>) => void
  updateExportSettings: (settings: Partial<ExportSettings>) => void
  resetSettings: () => void
  syncSettings: () => Promise<boolean>
} 