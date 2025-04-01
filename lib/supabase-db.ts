import { v4 as uuidv4 } from 'uuid'
import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'
import { getSupabaseClient, isSupabaseEnabled } from './supabase'

interface CacheData {
  queue: ProcessingStatus[]
  results: Map<string, OCRResult[]>
  stats: DatabaseStats | null
}

type ReconnectionState = 'idle' | 'connecting' | 'success' | 'error';

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
  private reconnectInterval: NodeJS.Timeout | null = null
  private reconnectionAttempts = 0
  private maxReconnectionAttempts = 10
  private reconnectionState: ReconnectionState = 'idle'
  private reconnectionListeners: ((state: ReconnectionState) => void)[] = []

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
    console.log('[SupabaseDB] Back online, initiating reconnection...')
    this.isOffline = false
    this.initiateReconnection()
  }
  
  private handleOffline = () => {
    console.log('[SupabaseDB] Device is offline, queuing changes')
    this.isOffline = true
    
    // Clear any pending reconnection attempts
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval)
      this.reconnectInterval = null
    }
    
    this.updateReconnectionState('idle')
  }
  
  private initiateReconnection = () => {
    // If already connecting or successfully connected, don't start again
    if (this.reconnectionState === 'connecting' || this.reconnectionState === 'success') {
      return
    }
    
    console.log('[SupabaseDB] Initiating reconnection process')
    this.reconnectionAttempts = 0
    this.tryReconnect()
  }
  
  /**
   * Attempt to reconnect with exponential backoff
   */
  private tryReconnect = async () => {
    if (this.isOffline) {
      console.log('[SupabaseDB] Still offline, cannot reconnect')
      this.updateReconnectionState('error')
      return
    }
    
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
      console.log('[SupabaseDB] Max reconnection attempts reached')
      this.updateReconnectionState('error')
      return
    }
    
    this.updateReconnectionState('connecting')
    
    try {
      console.log(`[SupabaseDB] Reconnection attempt ${this.reconnectionAttempts + 1}/${this.maxReconnectionAttempts}`)
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('documents').select('count').limit(1).single()
      
      if (error) {
        throw error
      }
      
      // Successful connection
      console.log('[SupabaseDB] Reconnection successful')
      this.updateReconnectionState('success')
      
      // Sync offline changes
      await this.syncOfflineChanges()
      
      // Clear any pending reconnect interval
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval)
        this.reconnectInterval = null
      }
    } catch (error) {
      console.error('[SupabaseDB] Reconnection attempt failed:', error)
      
      // Calculate delay with exponential backoff: 2^n seconds (max 2 minutes)
      const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectionAttempts), 120000)
      // Add some randomness (jitter) to prevent all clients reconnecting at the same time
      const jitter = Math.random() * 1000
      const delay = baseDelay + jitter
      
      console.log(`[SupabaseDB] Will try again in ${Math.round(delay / 1000)} seconds`)
      
      this.reconnectionAttempts++
      
      // Schedule next attempt with exponential backoff
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval)
      }
      
      this.reconnectInterval = setTimeout(this.tryReconnect, delay)
    }
  }
  
  /**
   * Manually trigger a reconnection attempt
   * @returns Promise that resolves to true if reconnection was successful
   */
  async reconnect(): Promise<boolean> {
    // If offline, don't even try
    if (this.isOffline) {
      console.log('[SupabaseDB] Device is offline, cannot manually reconnect')
      return false
    }
    
    // Reset reconnection attempts to start fresh
    this.reconnectionAttempts = 0
    
    // Clear any existing reconnection interval
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval)
      this.reconnectInterval = null
    }
    
    this.updateReconnectionState('connecting')
    
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('documents').select('count').limit(1).single()
      
      if (error) {
        throw error
      }
      
      console.log('[SupabaseDB] Manual reconnection successful')
      this.updateReconnectionState('success')
      
      // Sync offline changes
      await this.syncOfflineChanges()
      
      return true
    } catch (error) {
      console.error('[SupabaseDB] Manual reconnection failed:', error)
      this.updateReconnectionState('error')
      return false
    }
  }
  
  /**
   * Get current reconnection state
   */
  getReconnectionState(): ReconnectionState {
    return this.reconnectionState
  }
  
  /**
   * Register a listener for reconnection state changes
   * @param listener Function that will be called when reconnection state changes
   * @returns Function to remove the listener
   */
  onReconnectionStateChange(listener: (state: ReconnectionState) => void): () => void {
    this.reconnectionListeners.push(listener)
    return () => {
      this.reconnectionListeners = this.reconnectionListeners.filter(l => l !== listener)
    }
  }
  
  private updateReconnectionState(state: ReconnectionState) {
    if (this.reconnectionState === state) return
    
    this.reconnectionState = state
    
    // Notify all listeners
    this.reconnectionListeners.forEach(listener => {
      try {
        listener(state)
      } catch (e) {
        console.error('[SupabaseDB] Error in reconnection state listener:', e)
      }
    })
    
    // Save last known state for recovery
    try {
      localStorage.setItem('supabase-reconnection-state', state)
    } catch (e) {
      console.warn('[SupabaseDB] Could not save reconnection state to localStorage:', e)
    }
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
        
        // Load last reconnection state if available
        const savedState = localStorage.getItem('supabase-reconnection-state')
        if (savedState) {
          this.reconnectionState = savedState as ReconnectionState
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
        this.updateReconnectionState('error')
      } else {
        this.updateReconnectionState('success')
      }
    } catch (error) {
      console.error('Supabase initialization error:', error)
      this.updateReconnectionState('error')
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
      
      // Get storage stats
      let storageStats: Partial<DatabaseStats> = {}
      try {
        storageStats = await this.getStorageStats()
      } catch (storageError) {
        console.error('Error getting storage stats:', storageError)
      }
      
      // Try to get storage quota info if available
      const { data: quotaData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'storage_quota')
        .single()
      
      const storageQuota = quotaData?.value ? Number(quotaData.value) : 500 // Default to 500MB if not specified
      
      // Calculate usage percentage
      const storageUsagePercent = storageStats.storageSize ? 
        Math.min(100, Math.round((storageStats.storageSize / storageQuota) * 100)) : 0
        
      // Estimate growth rate (MB per day) if we have lastCleared date
      let storageGrowthRate = 0
      if (lastCleared && storageStats.storageSize) {
        const daysSinceCleared = (Date.now() - lastCleared.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceCleared > 0) {
          storageGrowthRate = Number((storageStats.storageSize / Math.max(1, daysSinceCleared)).toFixed(2))
        }
      }
      
      const stats: DatabaseStats = {
        totalDocuments: documentsCount || 0,
        totalResults: resultsCount || 0,
        dbSize: Math.round(estimatedSize),
        lastCleared,
        storageProvider: 'supabase',
        storageSize: storageStats.storageSize || 0,
        storageFiles: storageStats.storageFiles || 0,
        storageBucket: storageStats.storageBucket,
        storageUsagePercent,
        storageQuota,
        storageGrowthRate
      }

      this.cache.stats = stats
      this.lastUpdate = now
      return stats
    } catch (error) {
      console.error('Error getting database stats:', error)
      return { totalDocuments: 0, totalResults: 0, dbSize: 0, storageProvider: 'supabase' }
    }
  }
  
  /**
   * Get storage statistics from Supabase Storage
   */
  private async getStorageStats(): Promise<Partial<DatabaseStats>> {
    try {
      const supabase = getSupabaseClient()
      const bucketName = 'documents'
      
      // List all files in the documents bucket
      const { data: files, error } = await supabase
        .storage
        .from(bucketName)
        .list()
      
      if (error) throw error
      
      if (!files || files.length === 0) {
        return {
          storageSize: 0,
          storageFiles: 0,
          storageBucket: bucketName
        }
      }
      
      // For each folder, list files within
      let totalSize = 0
      let totalFiles = 0
      
      // Process each folder (user ID)
      for (const item of files) {
        if (item.metadata) {
          // This is a file at the root level
          totalSize += item.metadata.size || 0
          totalFiles += 1
        } else {
          // This is a folder, get its contents
          const { data: folderFiles, error: folderError } = await supabase
            .storage
            .from(bucketName)
            .list(item.name)
          
          if (!folderError && folderFiles) {
            // Sum up sizes of all files in this folder
            for (const file of folderFiles) {
              if (file.metadata) {
                totalSize += file.metadata.size || 0
                totalFiles += 1
              }
            }
          }
        }
      }
      
      // Convert bytes to MB
      const storageSizeMB = totalSize / (1024 * 1024)
      
      return {
        storageSize: Number(storageSizeMB.toFixed(2)),
        storageFiles: totalFiles,
        storageBucket: bucketName
      }
    } catch (error) {
      console.error('Error calculating storage stats:', error)
      return {}
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
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval)
    }
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
    
    // Clear reconnection listeners
    this.reconnectionListeners = []
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