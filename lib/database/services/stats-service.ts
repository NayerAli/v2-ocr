// Database statistics operations

import type { DatabaseStats } from '@/types/settings'
import { supabase, isSupabaseConfigured } from '../utils'

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot get database stats.')
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }

  // Get documents count
  const { count: documentsCount, error: documentsError } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })

  if (documentsError) {
    console.error('Error getting documents count:', documentsError)
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }

  // Get OCR results count
  const { count: resultsCount, error: resultsError } = await supabase
    .from('ocr_results')
    .select('*', { count: 'exact', head: true })

  if (resultsError) {
    console.error('Error getting results count:', resultsError)
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }

  // Get last cleared date
  const { data: metadataData, error: metadataError } = await supabase
    .from('metadata')
    .select('*')
    .eq('key', 'lastCleared')
    .single()

  let lastCleared: Date | undefined = undefined
  if (!metadataError && metadataData) {
    lastCleared = new Date(metadataData.value as string)
  }

  // Calculate approximate size (this is an estimation)
  const estimatedSizePerRecord = 2 // KB
  const estimatedSize = ((documentsCount || 0) + (resultsCount || 0)) * estimatedSizePerRecord / 1024 // Convert to MB

  return {
    totalDocuments: documentsCount || 0,
    totalResults: resultsCount || 0,
    dbSize: Math.round(estimatedSize),
    lastCleared
  }
}

/**
 * Clean up old records
 */
export async function cleanupOldRecords(retentionPeriod: number): Promise<number> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot cleanup old records.')
    return 0
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod)
  const cutoffDateStr = cutoffDate.toISOString()

  // Find old records
  const { data: oldRecords, error: findError } = await supabase
    .from('documents')
    .select('id')
    .lt('created_at', cutoffDateStr)

  if (findError) {
    console.error('Error finding old records:', findError)
    return 0
  }

  if (!oldRecords || oldRecords.length === 0) {
    return 0
  }

  const oldIds = oldRecords.map(record => record.id)

  // Delete OCR results for these documents
  const { error: resultsError } = await supabase
    .from('ocr_results')
    .delete()
    .in('document_id', oldIds)

  if (resultsError) {
    console.error('Error deleting old OCR results:', resultsError)
  }

  // Delete documents
  const { error: documentsError } = await supabase
    .from('documents')
    .delete()
    .in('id', oldIds)

  if (documentsError) {
    console.error('Error deleting old documents:', documentsError)
  }

  return oldIds.length
}

/**
 * Clear the database
 */
export async function clearDatabase(type?: 'documents' | 'ocr_results' | 'all'): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot clear database.')
    return
  }

  if (!type || type === 'all') {
    await supabase.from('documents').delete().neq('id', 'placeholder')
    await supabase.from('ocr_results').delete().neq('id', 'placeholder')
  } else {
    await supabase.from(type).delete().neq('id', 'placeholder')
  }

  // Update metadata
  await supabase
    .from('metadata')
    .upsert({
      key: 'lastCleared',
      value: new Date().toISOString(),
      created_at: new Date().toISOString()
    })
}
