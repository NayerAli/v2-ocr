// Main database service class

import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'
import * as QueueService from './services/queue-service'
import * as ResultsService from './services/results-service'
import * as StatsService from './services/stats-service'
import * as DocumentService from './services/document-service'

interface CacheData {
  queue: ProcessingStatus[]
  results: Map<string, OCRResult[]>
  stats: DatabaseStats | null
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

  // Queue operations
  async getQueue(): Promise<ProcessingStatus[]> {
    const now = Date.now()
    // Only log in development mode and not too frequently
    const shouldLog = process.env.NODE_ENV === 'development' && Math.random() < 0.05;

    // Return cached results if within TTL
    if (this.cache.queue.length > 0 && now - this.lastUpdate < this.CACHE_TTL) {
      if (shouldLog) {
        console.log('[DEBUG] Returning cached queue, items:', this.cache.queue.length);
      }
      return this.cache.queue
    }

    const queue = await QueueService.getQueue()

    // Update cache
    this.cache.queue = queue
    this.lastUpdate = now
    if (shouldLog) {
      console.log('[DEBUG] Cache updated with queue items');
    }

    return queue
  }

  async saveToQueue(status: ProcessingStatus): Promise<void> {
    // Only log in development mode and not too frequently
    const shouldLog = process.env.NODE_ENV === 'development' && Math.random() < 0.1;

    await QueueService.saveToQueue(status)

    // Update cache
    if (shouldLog) {
      console.log('[DEBUG] Updating local cache');
    }
    const oldQueueLength = this.cache.queue.length;
    this.cache.queue = this.cache.queue
      .filter(item => item.id !== status.id)
      .concat([{
        ...status,
        createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
        updatedAt: new Date()
      }])
      .sort((a, b) => {
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
        return bTime - aTime
      })
    if (shouldLog) {
      console.log('[DEBUG] Cache updated, old length:', oldQueueLength, 'new length:', this.cache.queue.length);
    }
  }

  async addToQueue(document: Partial<ProcessingStatus>): Promise<void> {
    await QueueService.addToQueue(document)

    // Invalidate cache to force a refresh on next getQueue call
    this.lastUpdate = 0
    this.cache.queue = []
  }

  async removeFromQueue(id: string): Promise<void> {
    // Only log in development mode
    const shouldLog = process.env.NODE_ENV === 'development';

    await QueueService.removeFromQueue(id)

    // Invalidate cache
    this.lastUpdate = 0
    this.cache.queue = []
    this.cache.results.delete(id)
    this.cache.stats = null

    if (shouldLog) {
      console.log('[DEBUG] Cache invalidated');
    }
  }

  async updateQueueItem(id: string, updates: Partial<ProcessingStatus>): Promise<ProcessingStatus | null> {
    const updatedItem = await QueueService.updateQueueItem(id, updates)

    if (updatedItem) {
      // Update cache if item was found and updated
      this.cache.queue = this.cache.queue
        .filter(item => item.id !== id)
        .concat([updatedItem])
        .sort((a, b) => {
          const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
          const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
          return bTime - aTime
        })
    } else {
      // Invalidate cache if update failed
      this.lastUpdate = 0
      this.cache.queue = []
    }

    return updatedItem
  }

  // Results operations
  async getResults(documentId: string): Promise<OCRResult[]> {
    const cached = this.cache.results.get(documentId)
    if (cached) return cached

    const results = await ResultsService.getResults(documentId)

    // Update cache
    this.cache.results.set(documentId, results)

    return results
  }

  async saveResults(documentId: string, results: OCRResult[]): Promise<void> {
    await ResultsService.saveResults(documentId, results)

    // Update cache with the original format
    const camelCaseResults = results.map(result => ({
      ...result,
      documentId,
      id: result.id || crypto.randomUUID()
    }))

    this.cache.results.set(documentId, camelCaseResults)
    this.cache.stats = null
  }

  // Stats operations
  async getDatabaseStats(): Promise<DatabaseStats> {
    const now = Date.now()
    if (this.cache.stats && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.stats
    }

    const stats = await StatsService.getDatabaseStats()

    this.cache.stats = stats
    this.lastUpdate = now

    return stats
  }

  async cleanupOldRecords(retentionPeriod: number): Promise<number> {
    const count = await StatsService.cleanupOldRecords(retentionPeriod)

    // Invalidate cache
    this.lastUpdate = 0
    this.cache.queue = []
    this.cache.stats = null

    return count
  }

  async clearDatabase(type?: 'documents' | 'ocr_results' | 'all'): Promise<void> {
    await StatsService.clearDatabase(type)

    // Clear cache
    this.lastUpdate = 0
    this.cache.queue = []
    this.cache.results = new Map()
    this.cache.stats = null
  }

  // Document management operations
  async getDocuments(): Promise<ProcessingStatus[]> {
    return DocumentService.getDocuments()
  }

  async getDocument(id: string): Promise<ProcessingStatus | null> {
    return DocumentService.getDocument(id)
  }

  async saveDocument(document: Partial<ProcessingStatus>): Promise<ProcessingStatus | null> {
    return DocumentService.saveDocument(document)
  }

  async deleteDocument(id: string): Promise<boolean> {
    const result = await DocumentService.deleteDocument(id)

    // Invalidate cache if document was deleted
    if (result) {
      this.lastUpdate = 0
      this.cache.queue = []
      this.cache.results.delete(id)
      this.cache.stats = null
    }

    return result
  }
}

export const db = new DatabaseService()
