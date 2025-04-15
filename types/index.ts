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
  user_id?: string
  rateLimitInfo?: {
    isRateLimited: boolean
    retryAfter: number
    retryAt: string
  }
}

export interface ProcessingStatus {
  id: string
  filename: string
  originalFilename?: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
  progress?: number
  error?: string
  file?: File
  fileSize?: number // Changed from size to match DB schema
  fileType?: string // Changed from type to match DB schema
  storagePath?: string
  thumbnailPath?: string
  currentPage?: number
  totalPages?: number
  processingStartedAt?: Date // Changed from startTime
  processingCompletedAt?: Date // Changed from endTime
  metadata?: Record<string, any>
  results?: OCRResult[]
  createdAt: Date
  updatedAt: Date
  user_id?: string
  rateLimitInfo?: {
    isRateLimited: boolean
    retryAfter: number
    rateLimitStart: number
  }
}

export interface OCRSettings {
  apiKey: string
  provider: 'google' | 'microsoft' | 'mistral'
  region?: string
  language?: string
  useSystemKey?: boolean
}

