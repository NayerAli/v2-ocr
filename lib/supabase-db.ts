import { supabase, isSupabaseConfigured } from './supabase-client'
import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'

interface CacheData {
  queue: ProcessingStatus[]
  results: Map<string, OCRResult[]>
  stats: DatabaseStats | null
}

// Helper function to convert snake_case to camelCase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const snakeToCamel = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel)
  }

  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    acc[camelKey] = snakeToCamel(obj[key])
    return acc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as any)
}

// Helper function to convert camelCase to snake_case
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const camelToSnake = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake)
  }

  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)

    // Special case for 'id' which should remain as is
    const finalKey = key === 'id' ? 'id' : snakeKey

    // Skip File objects
    if (typeof window !== 'undefined' && obj[key] instanceof File) {
      // Skip File objects as they can't be serialized
      // We already handle this in saveToQueue by destructuring
    }
    // Handle Date objects
    else if (obj[key] instanceof Date) {
      acc[finalKey] = obj[key].toISOString()
    }
    // Handle other objects
    else if (typeof obj[key] === 'object' && obj[key] !== null) {
      acc[finalKey] = camelToSnake(obj[key])
    }
    // Handle primitive values
    else {
      acc[finalKey] = obj[key]
    }

    return acc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as any)
}

// Convert ProcessingStatus from Supabase to application format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapToProcessingStatus = (item: any): ProcessingStatus => {
  const status = snakeToCamel(item)

  // Convert string dates to Date objects
  if (status.createdAt && typeof status.createdAt === 'string') {
    status.createdAt = new Date(status.createdAt)
  }
  if (status.updatedAt && typeof status.updatedAt === 'string') {
    status.updatedAt = new Date(status.updatedAt)
  }

  return status as ProcessingStatus
}

// Convert OCRResult from Supabase to application format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapToOCRResult = (item: any): OCRResult => {
  const result = snakeToCamel(item)
  return result as OCRResult
}

class DatabaseService {
  private cache: CacheData = {
    queue: [],
    results: new Map(),
    stats: null
  }
  private lastUpdate = 0
  private CACHE_TTL = 2000 // 2 seconds

  constructor() {
    // No initialization needed for Supabase
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    const now = Date.now()
    if (this.cache.stats && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.stats
    }

    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot get database stats.')
      return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
    }

    // Get queue count
    const { count: queueCount, error: queueError } = await supabase
      .from('queue')
      .select('*', { count: 'exact', head: true })

    if (queueError) {
      console.error('Error getting queue count:', queueError)
      return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
    }

    // Get results count
    const { count: resultsCount, error: resultsError } = await supabase
      .from('results')
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
    // In a real implementation, you might want to get this from Supabase analytics
    const estimatedSizePerRecord = 2 // KB
    const estimatedSize = ((queueCount || 0) + (resultsCount || 0)) * estimatedSizePerRecord / 1024 // Convert to MB

    const stats = {
      totalDocuments: queueCount || 0,
      totalResults: resultsCount || 0,
      dbSize: Math.round(estimatedSize),
      lastCleared
    }

    this.cache.stats = stats
    this.lastUpdate = now
    return stats
  }

  async cleanupOldRecords(retentionPeriod: number) {
    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot cleanup old records.')
      return 0
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod)
    const cutoffDateStr = cutoffDate.toISOString()

    // Find old records
    const { data: oldRecords, error: findError } = await supabase
      .from('queue')
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

    // Delete results for these documents
    const { error: resultsError } = await supabase
      .from('results')
      .delete()
      .in('document_id', oldIds)

    if (resultsError) {
      console.error('Error deleting old results:', resultsError)
    }

    // Delete queue items
    const { error: queueError } = await supabase
      .from('queue')
      .delete()
      .in('id', oldIds)

    if (queueError) {
      console.error('Error deleting old queue items:', queueError)
    }

    return oldIds.length
  }

  async clearDatabase(type?: 'queue' | 'results' | 'all') {
    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot clear database.')
      return
    }

    if (!type || type === 'all') {
      await supabase.from('queue').delete().neq('id', 'placeholder')
      await supabase.from('results').delete().neq('id', 'placeholder')
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

    // Clear cache
    this.lastUpdate = 0
    this.cache.queue = []
    this.cache.results = new Map()
    this.cache.stats = null
  }

  async getQueue(): Promise<ProcessingStatus[]> {
    const now = Date.now()

    // Return cached results if within TTL
    if (this.cache.queue.length > 0 && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.queue
    }

    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot get queue.')
      return []
    }

    const { data, error } = await supabase
      .from('queue')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching queue:', error)
      return []
    }

    const queue = data.map(mapToProcessingStatus)

    // Update cache
    this.cache.queue = queue
    this.lastUpdate = now

    return queue
  }

  async saveToQueue(status: ProcessingStatus): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot save to queue.')
      return
    }

    // Ensure dates are properly set and remove the file field
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { file, ...statusWithoutFile } = status

    const updatedStatus = {
      ...statusWithoutFile,
      createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
      updatedAt: new Date()
    }

    // Convert to snake_case for Supabase
    const snakeCaseStatus = camelToSnake(updatedStatus)

    // Add some debug logging
    console.log('Saving to queue:', { id: updatedStatus.id, filename: updatedStatus.filename })

    try {
      // Upsert to Supabase
      const { error } = await supabase
        .from('queue')
        .upsert(snakeCaseStatus)
        .select()

      if (error) {
        console.error('Error saving to queue:', error)
        return
      }
    } catch (err) {
      console.error('Exception saving to queue:', err)
      return
    }

    // Error handling is now inside the try/catch block

    // Update cache
    this.cache.queue = this.cache.queue
      .filter(item => item.id !== status.id)
      .concat([updatedStatus])
      .sort((a, b) => {
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
        return bTime - aTime
      })
  }

  async removeFromQueue(id: string) {
    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot remove from queue.')
      return
    }

    // Delete from results first
    const { error: resultsError } = await supabase
      .from('results')
      .delete()
      .eq('document_id', id)

    if (resultsError) {
      console.error('Error removing results:', resultsError)
    }

    // Then delete from queue
    const { error: queueError } = await supabase
      .from('queue')
      .delete()
      .eq('id', id)

    if (queueError) {
      console.error('Error removing from queue:', queueError)
    }

    // Invalidate cache
    this.lastUpdate = 0
    this.cache.queue = []
    this.cache.results.delete(id)
    this.cache.stats = null
  }

  async getResults(documentId: string): Promise<OCRResult[]> {
    const cached = this.cache.results.get(documentId)
    if (cached) return cached

    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot get results.')
      return []
    }

    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('document_id', documentId)

    if (error) {
      console.error('Error fetching results:', error)
      return []
    }

    const results = data.map(mapToOCRResult)

    // Update cache
    this.cache.results.set(documentId, results)

    return results
  }

  async saveResults(documentId: string, results: OCRResult[]) {
    if (!isSupabaseConfigured()) {
      console.error('Supabase not configured. Cannot save results.')
      return
    }

    // First, verify that the document exists in the queue table
    const { data: queueItem, error: queueError } = await supabase
      .from('queue')
      .select('id')
      .eq('id', documentId)
      .single()

    if (queueError || !queueItem) {
      console.error('Error: Document not found in queue. Cannot save results.', queueError)
      console.log('Attempting to save results for document ID:', documentId)
      return
    }

    // Prepare results for Supabase
    const supabaseResults = results.map(result => {
      const preparedResult = {
        ...result,
        documentId,
        id: result.id || crypto.randomUUID()
      }
      return camelToSnake(preparedResult)
    })

    // Add some debug logging
    console.log('Saving results for document:', { documentId, count: results.length })

    try {
      // Check if the result set is too large
      const MAX_BATCH_SIZE = 100; // Maximum number of records to insert at once

      if (supabaseResults.length > MAX_BATCH_SIZE) {
        console.log(`Large result set detected (${supabaseResults.length} records). Splitting into batches of ${MAX_BATCH_SIZE}.`);

        // Split into smaller batches
        for (let i = 0; i < supabaseResults.length; i += MAX_BATCH_SIZE) {
          const batch = supabaseResults.slice(i, i + MAX_BATCH_SIZE);
          console.log(`Processing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(supabaseResults.length / MAX_BATCH_SIZE)} (${batch.length} records)`);

          const { error } = await supabase
            .from('results')
            .upsert(batch);

          if (error) {
            console.error(`Error saving batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}:`, error);
            // Continue with next batch instead of failing the entire operation
            continue;
          }
        }
      } else {
        // For smaller result sets, upsert all at once
        const { error } = await supabase
          .from('results')
          .upsert(supabaseResults);

        if (error) {
          console.error('Error saving results:', error);
          return;
        }
      }
    } catch (err) {
      console.error('Exception saving results:', err);
      return;
    }

    // Update cache with the original format
    const camelCaseResults = results.map(result => ({
      ...result,
      documentId,
      id: result.id || crypto.randomUUID()
    }))

    this.cache.results.set(documentId, camelCaseResults)
    this.cache.stats = null
  }
}

export const db = new DatabaseService()
