interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface OCRResult {
  id: string
  document_id: string
  text: string
  confidence: number
  language: string
  processing_time: number
  page_number: number
  total_pages?: number
  storage_path?: string
  image_url?: string // URL to the image in storage (signed URL)
  bounding_box?: BoundingBox
  error?: string
  user_id?: string
  provider?: string

  // CamelCase versions for client-side compatibility
  documentId?: string
  processingTime?: number
  pageNumber?: number
  totalPages?: number
  storagePath?: string
  imageUrl?: string // URL to the image in storage (signed URL)
  boundingBox?: BoundingBox
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
  user_id?: string // Use snake_case for database compatibility
  // Deprecated: userId should not be used, use user_id instead
  userId?: string
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

