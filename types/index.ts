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

