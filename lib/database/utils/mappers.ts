// Mapper functions to convert between database and application formats

import type { ProcessingStatus, OCRResult } from '@/types'
import { snakeToCamel } from './case-conversion'

// Convert ProcessingStatus from Supabase to application format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapToProcessingStatus = (item: any): ProcessingStatus => {
  console.log('[DEBUG] mapToProcessingStatus called with item:', item.id, item.filename);
  const status = snakeToCamel(item)
  console.log('[DEBUG] After snakeToCamel conversion:', status.id, status.filename);

  // Convert string dates to Date objects
  if (status.createdAt && typeof status.createdAt === 'string') {
    status.createdAt = new Date(status.createdAt)
  }
  if (status.updatedAt && typeof status.updatedAt === 'string') {
    status.updatedAt = new Date(status.updatedAt)
  }
  if (status.processingStartedAt && typeof status.processingStartedAt === 'string') {
    status.processingStartedAt = new Date(status.processingStartedAt)
  }
  if (status.processingCompletedAt && typeof status.processingCompletedAt === 'string') {
    status.processingCompletedAt = new Date(status.processingCompletedAt)
  }

  console.log('[DEBUG] Final status object:', status.id, status.filename, status.status);
  return status as ProcessingStatus
}

// Convert OCRResult from Supabase to application format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapToOCRResult = (item: any): OCRResult => {
  // First convert from snake_case to camelCase
  const result = snakeToCamel(item)

  // Ensure both camelCase and snake_case versions are available for compatibility
  if (item.image_url && !result.imageUrl) {
    result.imageUrl = item.image_url
  }

  if (item.storage_path && !result.storagePath) {
    result.storagePath = item.storage_path
  }

  if (item.page_number && !result.pageNumber) {
    result.pageNumber = item.page_number
  }

  if (item.total_pages && !result.totalPages) {
    result.totalPages = item.total_pages
  }

  if (item.processing_time && !result.processingTime) {
    result.processingTime = item.processing_time
  }

  if (item.document_id && !result.documentId) {
    result.documentId = item.document_id
  }

  return result as OCRResult
}
