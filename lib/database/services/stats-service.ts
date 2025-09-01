// Database statistics operations

import type { DatabaseStats } from '@/types/settings'
import { supabase, isSupabaseConfigured } from '../utils'

/**
 * Get database statistics directly from the database for the current user
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot get database stats.')
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }
  // Get the current user's ID once and reuse it
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const userId = userData.user?.id

  if (userError || !userId) {
    console.error('Error getting authenticated user:', userError)
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }

  // Get documents count for the current user
  const { count: documentsCount, error: documentsError } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (documentsError) {
    console.error('Error getting documents count:', documentsError)
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }

  // Get OCR results count for the current user
  const { count: resultsCount, error: resultsError } = await supabase
    .from('ocr_results')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (resultsError) {
    console.error('Error getting results count:', resultsError)
    return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
  }

  // Get last cleared date from system_metadata
  let metadataData: Record<string, unknown> | null = null
  let metadataError: unknown | null = null

  const systemMetadataResult = await supabase
    .from('system_metadata')
    .select('value')
    .eq('key', 'lastCleared')
    .single()

  metadataData = systemMetadataResult.data
  metadataError = systemMetadataResult.error

  // If not found in system_metadata, try the metadata table as fallback
  if (metadataError) {
    const oldMetadataResult = await supabase
      .from('metadata')
      .select('value')
      .eq('key', 'lastCleared')
      .single()

    if (!oldMetadataResult.error && oldMetadataResult.data) {
      metadataData = oldMetadataResult.data
      metadataError = null
    }
  }

  let lastCleared: Date | undefined = undefined
  if (!metadataError && metadataData) {
    // Parse the value from the jsonb field
    const valueStr = typeof metadataData.value === 'string'
      ? metadataData.value
      : JSON.stringify(metadataData.value)
    lastCleared = new Date(valueStr)
  }

  // Get the sum of file sizes for the current user using SQL function
  const { data: fileSizeData, error: fileSizeError } = await supabase
    .rpc('get_current_user_file_size')

  let totalFileSize = 0
  if (!fileSizeError && fileSizeData) {
    totalFileSize = fileSizeData
  } else {
    // Fallback: manually sum file sizes if the RPC function doesn't exist
    const { data: allFileSizes, error: allFileSizesError } = await supabase
      .from('documents')
      .select('file_size')
      .eq('user_id', userId)

    if (!allFileSizesError && allFileSizes) {
      totalFileSize = allFileSizes.reduce((sum, doc) => sum + (doc.file_size || 0), 0)
    } else {
      console.error('Error getting file sizes:', allFileSizesError || fileSizeError)
    }
  }

  // Convert total file size from bytes to MB
  const totalFileSizeMB = totalFileSize / (1024 * 1024)

  // Get OCR results size for the current user using SQL function
  const { data: ocrSizeData, error: ocrSizeError } = await supabase
    .rpc('get_current_user_ocr_size')

  let ocrResultsSizeMB = 0
  if (!ocrSizeError && ocrSizeData) {
    // Convert from bytes to MB
    ocrResultsSizeMB = ocrSizeData / (1024 * 1024)
  } else {
    // Fallback: manually calculate OCR size if the RPC function doesn't exist
    const { data: allOcrData, error: allOcrError } = await supabase
      .from('ocr_results')
      .select('text')
      .eq('user_id', userId)

    if (!allOcrError && allOcrData) {
      // Calculate size based on text length (1 character ≈ 1 byte in UTF-8 for basic Latin)
      const totalTextSize = allOcrData.reduce((sum, result) => sum + (result.text?.length || 0), 0)
      ocrResultsSizeMB = totalTextSize / (1024 * 1024)
    } else {
      console.error('Error getting OCR sizes:', allOcrError || ocrSizeError)
    }
  }

  // Total size in MB
  const totalSizeMB = totalFileSizeMB + ocrResultsSizeMB

  return {
    totalDocuments: documentsCount || 0,
    totalResults: resultsCount || 0,
    dbSize: Math.round(totalSizeMB),
    lastCleared
  }
}

/**
 * Clean up old records for the current user
 */
export async function cleanupOldRecords(retentionPeriod: number): Promise<number> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot cleanup old records.')
    return 0
  }

  // Get the current user's ID
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const userId = userData.user?.id

  if (userError || !userId) {
    console.error('No authenticated user found. Cannot cleanup old records.', userError)
    return 0
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod)
  const cutoffDateStr = cutoffDate.toISOString()

  // Find old records for the current user
  const { data: oldRecords, error: findError } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
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
 * Clear the current user's data from the database
 */
export async function clearDatabase(type?: 'documents' | 'ocr_results' | 'all'): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot clear database.')
    return
  }

  // Get the current user's ID
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const userId = userData.user?.id

  if (userError || !userId) {
    console.error('No authenticated user found. Cannot clear database.', userError)
    return
  }

  if (!type || type === 'all') {
    // Only delete the current user's documents
    await supabase.from('documents').delete().eq('user_id', userId)
    // Only delete the current user's OCR results
    await supabase.from('ocr_results').delete().eq('user_id', userId)
  } else {
    // Only delete the current user's data of the specified type
    await supabase.from(type).delete().eq('user_id', userId)
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
