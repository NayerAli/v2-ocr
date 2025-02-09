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
  imageUrl?: string
  boundingBox?: BoundingBox
  error?: string
}

export interface ProcessingStatus {
  id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
  progress?: number
  error?: string
  file?: File
  size?: number
  type?: string
  currentPage?: number
  totalPages?: number
  startTime?: number
  endTime?: number
  results?: OCRResult[]
  createdAt: Date
  updatedAt: Date
  rateLimitInfo?: {
    isRateLimited: boolean
    retryAfter: number
    rateLimitStart: number
  }
}

export interface OCRSettings {
  apiKey: string
  provider: 'google' | 'microsoft'
  region?: string
  language?: string
}

