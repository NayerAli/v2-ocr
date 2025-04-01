interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface OCRResult {
  id: string
  documentId: string
  text: string
  confidence: number
  language: string
  processingTime: number
  pageNumber: number
  totalPages?: number
  imageUrl?: string
  boundingBox?: BoundingBox
  error?: string
  rateLimitInfo?: {
    isRateLimited: boolean
    retryAfter: number
    timestamp: number
  }
}

export interface ProcessingStatus {
  id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled' | 'rate_limited'
  progress?: number
  error?: string
  file?: File
  fileType?: string
  fileSize?: number
  fileUrl?: string
  currentPage?: number
  totalPages?: number
  startTime?: number
  endTime?: number
  completionTime?: number
  metadata?: Record<string, any>
  results?: OCRResult[]
  createdAt: Date | string
  updatedAt: Date | string
  rateLimitInfo?: {
    isRateLimited: boolean
    retryAfter: number
    timestamp: number
  }
  migrated?: boolean
}

export interface OCRSettings {
  apiKey: string
  provider: 'google' | 'microsoft' | 'mistral'
  region?: string
  language?: string
}

