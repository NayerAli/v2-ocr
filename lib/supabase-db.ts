import { v4 as uuidv4 } from 'uuid'
import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'
import { getSupabaseClient, isSupabaseEnabled } from './supabase'

interface CacheData {
  queue: ProcessingStatus[]
  results: Map<string, OCRResult[]>
  stats: DatabaseStats | null
}

class SupabaseService {
  private cache: CacheData = {
    queue: [],
    results: new Map(),
    stats: null
  }
  private lastUpdate = 0
  private CACHE_TTL = 2000 // 2 seconds
  private offlineQueue: {
    type: 'saveToQueue' | 'saveResults' | 'removeFromQueue' | 'saveSettings';
    payload: any;
    timestamp: number;
  }[] = []
  private isOffline = false
  private syncInterval: NodeJS.Timeout | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.initDB().catch(console.error)
      this.initOfflineSupport()
    }
  }

  private initOfflineSupport() {
    // Set up online/offline detection
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
    
    // Check initial state
    this.isOffline = !navigator.onLine
    
    // Initialize sync interval that runs every minute
    this.syncInterval = setInterval(this.syncOfflineChanges, 60000)
    
    // Load offline queue from localStorage
    this.loadOfflineQueue()
  }
  
  private handleOnline = async () => {
    console.log('[SupabaseDB] Back online, syncing changes...')
    this.isOffline = false
    await this.syncOfflineChanges()
  }
  
  private handleOffline = () => {
    console.log('[SupabaseDB] Device is offline, queuing changes')
    this.isOffline = true
  }
  
  private syncOfflineChanges = async () => {
    if (this.isOffline || this.offlineQueue.length === 0) return
    
    console.log(`[SupabaseDB] Syncing ${this.offlineQueue.length} offline changes`)
    
    const queue = [...this.offlineQueue]
    this.offlineQueue = []
    
    // Process each item in order
    for (const item of queue) {
      try {
        if (item.type === 'saveToQueue') {
          await this.processSaveToQueue(item.payload)
        } else if (item.type === 'saveResults') {
          await this.processSaveResults(item.payload.documentId, item.payload.results)
        } else if (item.type === 'removeFromQueue') {
          await this.processRemoveFromQueue(item.payload)
        } else if (item.type === 'saveSettings') {
          await this.processSaveSettings(item.payload.key, item.payload.value)
        }
      } catch (error) {
        console.error(`[SupabaseDB] Error syncing offline change:`, error)
        // Put back in queue if still relevant (not too old)
        const isStillRelevant = Date.now() - item.timestamp < 24 * 60 * 60 * 1000 // 1 day
        if (isStillRelevant) {
          this.offlineQueue.push(item)
        }
      }
    }
    
    // Save updated queue
    this.saveOfflineQueue()
  }
  
  private saveOfflineQueue() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('supabase-offline-queue', JSON.stringify(this.offlineQueue))
      } catch (error) {
        console.warn('[SupabaseDB] Error saving offline queue:', error)
      }
    }
  }
  
  private loadOfflineQueue() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('supabase-offline-queue')
        if (saved) {
          this.offlineQueue = JSON.parse(saved)
          console.log(`[SupabaseDB] Loaded ${this.offlineQueue.length} offline changes`)
        }
      } catch (error) {
        console.warn('[SupabaseDB] Error loading offline queue:', error)
      }
    }
  }

  private async initDB() {
    try {
      // Test connection by checking for tables
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('documents').select('id').limit(1)
      
      if (error) {
        console.error('Supabase initialization error:', error)
      }
    } catch (error) {
      console.error('Supabase initialization error:', error)
    }
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    const now = Date.now()
    if (this.cache.stats && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.stats
    }

    try {
      const supabase = getSupabaseClient()
      
      // Count documents
      const { count: documentsCount, error: documentsError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
      
      if (documentsError) throw documentsError
      
      // Count results
      const { count: resultsCount, error: resultsError } = await supabase
        .from('ocr_results')
        .select('*', { count: 'exact', head: true })
      
      if (resultsError) throw resultsError
      
      // Get last cleared timestamp
      const { data: metadataData, error: metadataError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'lastCleared')
        .single()
      
      if (metadataError && metadataError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is fine
        console.warn('Error fetching metadata:', metadataError)
      }
      
      // Estimate DB size - this is approximate since we can't directly get storage size
      // For a real app, you might want to track this separately or use Supabase metrics API
      const avgDocSize = 2 * 1024 // 2KB average per document as a rough estimate
      const avgResultSize = 10 * 1024 // 10KB average per OCR result as a rough estimate
      const estimatedSize = ((documentsCount || 0) * avgDocSize + (resultsCount || 0) * avgResultSize) / (1024 * 1024) // Convert to MB
      
      const lastCleared = metadataData?.value ? new Date(metadataData.value as string) : undefined
      
      const stats = {
        totalDocuments: documentsCount || 0,
        totalResults: resultsCount || 0,
        dbSize: Math.round(estimatedSize),
        lastCleared
      }

      this.cache.stats = stats
      this.lastUpdate = now
      return stats
    } catch (error) {
      console.error('Error getting database stats:', error)
      return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
    }
  }

  async cleanupOldRecords(retentionPeriod: number) {
    try {
      const supabase = getSupabaseClient()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod)
      
      // Get IDs of old documents
      const { data: oldDocuments, error: findError } = await supabase
        .from('documents')
        .select('id')
        .lt('created_at', cutoffDate.toISOString())
      
      if (findError) throw findError
      if (!oldDocuments?.length) return 0
      
      const documentIds = oldDocuments.map(doc => doc.id)
      
      // Delete related OCR results first (maintaining referential integrity)
      const { error: resultsError } = await supabase
        .from('ocr_results')
        .delete()
        .in('document_id', documentIds)
      
      if (resultsError) throw resultsError
      
      // Then delete the documents
      const { error: documentsError } = await supabase
        .from('documents')
        .delete()
        .in('id', documentIds)
      
      if (documentsError) throw documentsError
      
      // Invalidate cache
      this.lastUpdate = 0
      this.cache.queue = []
      this.cache.stats = null
      
      return documentIds.length
    } catch (error) {
      console.error('Error cleaning up old records:', error)
      return 0
    }
  }

  async clearDatabase(type?: 'queue' | 'results' | 'all') {
    try {
      const supabase = getSupabaseClient()
      
      if (!type || type === 'all' || type === 'results') {
        const { error: resultsError } = await supabase
          .from('ocr_results')
          .delete()
          .neq('id', 'placeholder') // A way to delete all rows
        
        if (resultsError) throw resultsError
      }
      
      if (!type || type === 'all' || type === 'queue') {
        const { error: documentsError } = await supabase
          .from('documents')
          .delete()
          .neq('id', 'placeholder') // A way to delete all rows
        
        if (documentsError) throw documentsError
      }
      
      // Record last cleared date
      const { error: metadataError } = await supabase
        .from('settings')
        .upsert({
          key: 'lastCleared',
          value: new Date().toISOString()
        }, { onConflict: 'key' })
      
      if (metadataError) throw metadataError
      
      // Invalidate cache
      this.lastUpdate = 0
      this.cache.queue = []
      this.cache.results = new Map()
      this.cache.stats = null
    } catch (error) {
      console.error('Error clearing database:', error)
    }
  }

  async getQueue(): Promise<ProcessingStatus[]> {
    const now = Date.now()
    
    // Return cached results if within TTL
    if (this.cache.queue.length > 0 && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.queue
    }

    try {
      if (this.isOffline) {
        console.warn('[SupabaseDB] Device is offline, returning cached queue')
        return this.cache.queue
      }

      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Ensure all items have valid dates
      const sorted = (data || []).map(item => ({
        ...item,
        createdAt: item.created_at ? new Date(item.created_at) : new Date(),
        updatedAt: item.updated_at ? new Date(item.updated_at) : new Date()
      })) as ProcessingStatus[]
      
      this.cache.queue = sorted
      this.lastUpdate = now
      
      // Cache queue in localStorage for offline use
      try {
        localStorage.setItem('supabase-queue-cache', JSON.stringify(sorted))
      } catch (err) {
        console.warn('[SupabaseDB] Error caching queue in localStorage:', err)
      }
      
      return sorted
    } catch (error) {
      console.error('Error fetching queue:', error)
      
      // Try to load from localStorage if available
      try {
        const cached = localStorage.getItem('supabase-queue-cache')
        if (cached) {
          const parsedCache = JSON.parse(cached)
          console.log('[SupabaseDB] Using cached queue from localStorage')
          return parsedCache
        }
      } catch (err) {
        console.warn('[SupabaseDB] Error loading cached queue:', err)
      }
      
      return this.cache.queue
    }
  }

  async saveToQueue(status: ProcessingStatus): Promise<void> {
    // Ensure dates are properly set
    const updatedStatus = {
      ...status,
      createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
      updatedAt: new Date()
    }
    
    // Update cache immediately for responsive UI
    this.cache.queue = this.cache.queue
      .filter(item => item.id !== status.id)
      .concat([updatedStatus])
      .sort((a, b) => {
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
        return bTime - aTime
      })
    
    // Update localStorage cache
    try {
      localStorage.setItem('supabase-queue-cache', JSON.stringify(this.cache.queue))
    } catch (err) {
      console.warn('[SupabaseDB] Error updating queue cache:', err)
    }
    
    if (this.isOffline) {
      console.log('[SupabaseDB] Device is offline, queuing save operation')
      this.offlineQueue.push({
        type: 'saveToQueue',
        payload: updatedStatus,
        timestamp: Date.now()
      })
      this.saveOfflineQueue()
      return
    }
    
    // If online, process immediately
    await this.processSaveToQueue(updatedStatus)
  }
  
  private async processSaveToQueue(status: ProcessingStatus): Promise<void> {
    try {
      const supabase = getSupabaseClient()
      
      // Convert to database structure
      const dbRecord = {
        id: status.id,
        name: status.name,
        status: status.status,
        progress: status.progress,
        created_at: status.createdAt instanceof Date ? status.createdAt.toISOString() : status.createdAt,
        updated_at: status.updatedAt instanceof Date ? status.updatedAt.toISOString() : status.updatedAt,
        file_url: status.fileUrl || null,
        file_type: status.fileType || null,
        total_pages: status.totalPages || null,
        processed_pages: status.processedPages || null,
        file_size: status.fileSize || null
      }
      
      const { error } = await supabase
        .from('documents')
        .upsert(dbRecord, { onConflict: 'id' })
      
      if (error) throw error
      
      console.log(`[SupabaseDB] Saved document to queue: ${status.id}`)
    } catch (error) {
      console.error('Error saving to queue:', error)
      
      // If there was an error saving to Supabase, queue for retry
      if (!this.offlineQueue.some(item => item.type === 'saveToQueue' && item.payload.id === status.id)) {
        this.offlineQueue.push({
          type: 'saveToQueue',
          payload: status,
          timestamp: Date.now()
        })
        this.saveOfflineQueue()
      }
    }
  }

  async getResults(documentId: string): Promise<OCRResult[]> {
    const cached = this.cache.results.get(documentId)
    if (cached) return cached
    
    try {
      if (this.isOffline) {
        // Try to get from localStorage cache
        try {
          const localKey = `supabase-results-${documentId}`
          const cached = localStorage.getItem(localKey)
          if (cached) {
            const parsedResults = JSON.parse(cached)
            this.cache.results.set(documentId, parsedResults)
            return parsedResults
          }
        } catch (err) {
          console.warn('[SupabaseDB] Error loading cached results:', err)
        }
        
        // If nothing in cache, return empty array
        console.warn('[SupabaseDB] Device is offline, no cached results available')
        return []
      }
      
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('ocr_results')
        .select('*')
        .eq('document_id', documentId)
      
      if (error) throw error
      
      // Convert from DB format to app format
      const results = (data || []).map(item => ({
        id: item.id,
        documentId: item.document_id,
        text: item.text,
        confidence: item.confidence,
        pageNumber: item.page_number,
        boundingBox: item.bounding_box,
        // Add any other fields needed
      })) as OCRResult[]
      
      this.cache.results.set(documentId, results)
      
      // Cache in localStorage
      try {
        localStorage.setItem(`supabase-results-${documentId}`, JSON.stringify(results))
      } catch (err) {
        console.warn('[SupabaseDB] Error caching results in localStorage:', err)
      }
      
      return results
    } catch (error) {
      console.error('Error fetching results:', error)
      
      // Try to get from localStorage cache as fallback
      try {
        const localKey = `supabase-results-${documentId}`
        const cached = localStorage.getItem(localKey)
        if (cached) {
          const parsedResults = JSON.parse(cached)
          return parsedResults
        }
      } catch (err) {
        console.warn('[SupabaseDB] Error loading cached results:', err)
      }
      
      return []
    }
  }

  async saveResults(documentId: string, results: OCRResult[]): Promise<void> {
    // Update cache immediately
    this.cache.results.set(documentId, results)
    this.cache.stats = null
    
    // Cache in localStorage
    try {
      localStorage.setItem(`supabase-results-${documentId}`, JSON.stringify(results))
    } catch (err) {
      console.warn('[SupabaseDB] Error caching results in localStorage:', err)
    }
    
    if (this.isOffline) {
      console.log('[SupabaseDB] Device is offline, queuing results save operation')
      this.offlineQueue.push({
        type: 'saveResults',
        payload: { documentId, results },
        timestamp: Date.now()
      })
      this.saveOfflineQueue()
      return
    }
    
    // If online, process immediately
    await this.processSaveResults(documentId, results)
  }
  
  private async processSaveResults(documentId: string, results: OCRResult[]): Promise<void> {
    try {
      const supabase = getSupabaseClient()
      
      // Convert to database structure
      const dbRecords = results.map(result => ({
        id: result.id,
        document_id: documentId,
        text: result.text,
        confidence: result.confidence,
        page_number: result.pageNumber,
        bounding_box: result.boundingBox
        // Add any other fields needed
      }))
      
      // Insert in batches if many records
      const BATCH_SIZE = 50
      
      for (let i = 0; i < dbRecords.length; i += BATCH_SIZE) {
        const batch = dbRecords.slice(i, i + BATCH_SIZE)
        
        const { error } = await supabase
          .from('ocr_results')
          .upsert(batch, { onConflict: 'id' })
        
        if (error) throw error
      }
      
      console.log(`[SupabaseDB] Saved ${results.length} results for document ${documentId}`)
    } catch (error) {
      console.error('Error saving results:', error)
      
      // If error, queue for retry if not already in queue
      const existingIndex = this.offlineQueue.findIndex(
        item => item.type === 'saveResults' && item.payload.documentId === documentId
      )
      
      if (existingIndex === -1) {
        this.offlineQueue.push({
          type: 'saveResults',
          payload: { documentId, results },
          timestamp: Date.now()
        })
      } else {
        // Update existing queued item
        this.offlineQueue[existingIndex] = {
          type: 'saveResults',
          payload: { documentId, results },
          timestamp: Date.now()
        }
      }
      
      this.saveOfflineQueue()
    }
  }

  async removeFromQueue(id: string): Promise<void> {
    // Update cache immediately
    this.cache.queue = this.cache.queue.filter(item => item.id !== id)
    this.cache.results.delete(id)
    this.cache.stats = null
    
    // Update localStorage cache
    try {
      localStorage.setItem('supabase-queue-cache', JSON.stringify(this.cache.queue))
      localStorage.removeItem(`supabase-results-${id}`)
    } catch (err) {
      console.warn('[SupabaseDB] Error updating cache after removal:', err)
    }
    
    if (this.isOffline) {
      console.log('[SupabaseDB] Device is offline, queuing remove operation')
      this.offlineQueue.push({
        type: 'removeFromQueue',
        payload: id,
        timestamp: Date.now()
      })
      this.saveOfflineQueue()
      return
    }
    
    // If online, process immediately
    await this.processRemoveFromQueue(id)
  }
  
  private async processRemoveFromQueue(id: string): Promise<void> {
    try {
      const supabase = getSupabaseClient()
      
      // Begin transaction by deleting document
      const { error: docError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
      
      if (docError) throw docError
      
      // Delete related results
      const { error: resultsError } = await supabase
        .from('ocr_results')
        .delete()
        .eq('document_id', id)
      
      if (resultsError) throw resultsError
      
      console.log(`[SupabaseDB] Removed document ${id} and its results`)
    } catch (error) {
      console.error('Error removing from queue:', error)
      
      // Queue for retry if not already in queue
      if (!this.offlineQueue.some(item => item.type === 'removeFromQueue' && item.payload === id)) {
        this.offlineQueue.push({
          type: 'removeFromQueue',
          payload: id,
          timestamp: Date.now()
        })
        this.saveOfflineQueue()
      }
    }
  }
  
  // Clean up event listeners when instance is destroyed
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
  }

  // Settings related methods
  async getSettings(key: string): Promise<Record<string, any> | null> {
    try {
      const supabase = getSupabaseClient()
      
      // First check if we can connect to Supabase
      try {
        await supabase.from('settings').select('count').limit(1).maybeSingle()
      } catch (connectionError) {
        console.error(`[SupabaseDB] Connection error checking settings table:`, connectionError)
        throw new Error('Unable to connect to Supabase')
      }
      
      // Try both table schemas - with and without user_id
      // First try the new schema (20240403_setup_settings.sql)
      let { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle()
        
      if (error) {
        if (error.code === 'PGRST116') {
          // Not found in new schema, try old schema with user_id
          const { data: oldData, error: oldError } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .is('user_id', null) // For application-wide settings
            .maybeSingle()
            
          if (oldError) {
            if (oldError.code === 'PGRST116') {
              // Not found in either schema
              return null
            }
            throw oldError
          }
          
          return oldData?.value || null
        }
        throw error
      }
      
      return data?.value || null
    } catch (error) {
      console.error(`[SupabaseDB] Error getting settings for key ${key}:`, error)
      return null
    }
  }
  
  async saveSettings(key: string, value: Record<string, any>): Promise<boolean> {
    try {
      if (this.isOffline) {
        this.offlineQueue.push({
          type: 'saveSettings',
          payload: { key, value },
          timestamp: Date.now()
        })
        this.saveOfflineQueue()
        return true
      }
      
      return await this.processSaveSettings(key, value)
    } catch (error) {
      console.error(`[SupabaseDB] Error saving settings for key ${key}:`, error)
      return false
    }
  }
  
  private async processSaveSettings(key: string, value: Record<string, any>): Promise<boolean> {
    try {
      const supabase = getSupabaseClient()
      
      // Try both table schemas - with and without user_id
      // First check if settings exist in new schema (20240403_setup_settings.sql)
      const { data, error: checkError } = await supabase
        .from('settings')
        .select('id')
        .eq('key', key)
        .maybeSingle()
      
      if (checkError && !checkError.message.includes('does not exist')) {
        throw checkError
      }
      
      if (data) {
        // Update existing setting in new schema
        const { error: updateError } = await supabase
          .from('settings')
          .update({ value })
          .eq('key', key)
        
        if (updateError) throw updateError
        return true
      } 
      
      // Check old schema or try insert
      try {
        // Check if it exists in old schema with user_id
        const { data: oldData, error: oldCheckError } = await supabase
          .from('settings')
          .select('id')
          .eq('key', key)
          .is('user_id', null)
          .maybeSingle()
          
        if (oldCheckError && !oldCheckError.message.includes('does not exist')) {
          throw oldCheckError
        }
        
        if (oldData) {
          // Update in old schema
          const { error: oldUpdateError } = await supabase
            .from('settings')
            .update({ value })
            .eq('id', oldData.id)
            
          if (oldUpdateError) throw oldUpdateError
          return true
        }
        
        // Try insert into new schema
        const { error: insertError } = await supabase
          .from('settings')
          .insert({ key, value })
        
        if (insertError) {
          // If that fails, try old schema
          if (insertError.message.includes('duplicate key') || 
              insertError.message.includes('does not exist')) {
            const { error: oldInsertError } = await supabase
              .from('settings')
              .insert({ key, value, user_id: null })
              
            if (oldInsertError) throw oldInsertError
          } else {
            throw insertError
          }
        }
        
        return true
      } catch (error) {
        console.error(`[SupabaseDB] Error in processSaveSettings inner try/catch:`, error)
        throw error
      }
    } catch (error) {
      console.error(`[SupabaseDB] Error processing save settings for key ${key}:`, error)
      return false
    }
  }
}

// Create singleton instance
export const supabaseDB = isSupabaseEnabled() ? new SupabaseService() : null

// Get database service (with error handling)
export function getSupabaseDB() {
  if (!supabaseDB) {
    throw new Error('Supabase database service not initialized. Check your environment variables.')
  }
  return supabaseDB
} 