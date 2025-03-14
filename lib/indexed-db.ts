import { openDB, type IDBPDatabase } from 'idb'
import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'

interface OCRDatabase {
  queue: ProcessingStatus
  results: OCRResult
  metadata: {
    key: string
    value: unknown
  }
}

interface CacheData {
  queue: ProcessingStatus[]
  results: Map<string, OCRResult[]>
  stats: DatabaseStats | null
}

class DatabaseService {
  private dbName = "ocr-dashboard"
  private version = 2
  private db: Promise<IDBPDatabase<OCRDatabase>> | null = null
  private cache: CacheData = {
    queue: [],
    results: new Map(),
    stats: null
  }
  private lastUpdate = 0
  private CACHE_TTL = 2000 // 2 seconds

  constructor() {
    if (typeof window !== 'undefined') {
      this.initDB().catch(console.error)
    }
  }

  private async initDB() {
    try {
      this.db = openDB<OCRDatabase>(this.dbName, this.version, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore("queue", { keyPath: 'id', autoIncrement: false })
            db.createObjectStore("results", { keyPath: 'id', autoIncrement: false })
          }
          if (oldVersion < 2 && !db.objectStoreNames.contains("metadata")) {
            db.createObjectStore("metadata", { keyPath: 'key', autoIncrement: false })
          }
        },
        blocked() {
          console.warn('Please close other tabs/windows using this app')
        },
        blocking() {
          window.location.reload()
        },
      })
    } catch (error) {
      console.error('IndexedDB initialization error:', error)
      this.db = null
    }
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    const now = Date.now()
    if (this.cache.stats && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.stats
    }

    if (!this.db) return { totalDocuments: 0, totalResults: 0, dbSize: 0 }
    const db = await this.db
    
    const queue = await db.getAll("queue")
    const results = await db.getAll("results")
    
    let lastCleared: Date | undefined = undefined
    try {
      const metadata = await db.get("metadata", "lastCleared")
      lastCleared = metadata?.value
    } catch (error) {
      console.warn('Metadata store not available:', error)
    }
    
    // Calculate sizes in chunks to avoid string length issues
    const calculateSize = (items: (ProcessingStatus | OCRResult)[]): number => {
      const CHUNK_SIZE = 100
      let totalSize = 0
      
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE)
        try {
          totalSize += new Blob([JSON.stringify(chunk)]).size
        } catch (error) {
          console.warn('Error calculating chunk size:', error)
        }
      }
      
      return totalSize
    }
    
    const queueSize = calculateSize(queue)
    const resultsSize = calculateSize(results)
    
    const stats = {
      totalDocuments: queue.length,
      totalResults: results.length,
      dbSize: Math.round((queueSize + resultsSize) / (1024 * 1024)), // Convert to MB
      lastCleared
    }

    this.cache.stats = stats
    this.lastUpdate = now
    return stats
  }

  async cleanupOldRecords(retentionPeriod: number) {
    if (!this.db) return
    const db = await this.db
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod)

    const queue = await db.getAll("queue")
    const oldRecords = queue.filter(item => new Date(item.createdAt) < cutoffDate)
    
    await Promise.all(oldRecords.map(async record => {
      await db.delete("queue", record.id)
      const results = await this.getResults(record.id)
      await Promise.all(results.map(result => db.delete("results", result.id)))
    }))

    return oldRecords.length
  }

  async clearDatabase(type?: 'queue' | 'results' | 'all') {
    if (!this.db) return
    const db = await this.db

    if (!type || type === 'all') {
      await db.clear("queue")
      await db.clear("results")
    } else {
      await db.clear(type)
    }

    await db.put("metadata", {
      key: "lastCleared",
      value: new Date()
    })
  }

  async getQueue(): Promise<ProcessingStatus[]> {
    const now = Date.now()
    
    // Return cached results if within TTL
    if (this.cache.queue.length > 0 && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.queue
    }

    const db = await this.db
    if (!db) {
      console.error('Database not initialized')
      return []
    }

    const queue = await db.getAll("queue")
    
    // Ensure all items have valid dates and sort
    const sorted = queue
      .map(item => ({
        ...item,
        createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt || Date.now()),
        updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt || Date.now())
      }))
      .sort((a, b) => {
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
        return bTime - aTime
      })
    
    this.cache.queue = sorted
    this.lastUpdate = now
    return sorted
  }

  async saveToQueue(status: ProcessingStatus): Promise<void> {
    const db = await this.db
    if (!db) {
      console.error('Database not initialized')
      return
    }
    
    // Ensure dates are properly set
    const updatedStatus = {
      ...status,
      createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
      updatedAt: new Date()
    }
    
    await db.put("queue", updatedStatus)
    
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
    if (!this.db) return
    const db = await this.db
    
    // Batch delete operation
    const tx = db.transaction(["queue", "results"], "readwrite")
    await tx.objectStore("queue").delete(id)
    
    const results = await this.getResults(id)
    await Promise.all(results.map(result => 
      tx.objectStore("results").delete(result.id)
    ))
    
    await tx.done
    
    // Invalidate cache
    this.lastUpdate = 0
    this.cache.queue = []
    this.cache.results.delete(id)
    this.cache.stats = null
  }

  async getResults(documentId: string): Promise<OCRResult[]> {
    const cached = this.cache.results.get(documentId)
    if (cached) return cached

    if (!this.db) return []
    const db = await this.db
    const allResults = await db.getAll("results")
    const filtered = allResults.filter(r => r.documentId === documentId)
    
    this.cache.results.set(documentId, filtered)
    return filtered
  }

  async saveResults(documentId: string, results: OCRResult[]) {
    if (!this.db) return
    const db = await this.db
    const tx = db.transaction("results", "readwrite")
    await Promise.all(
      results.map(result => tx.store.put({
        ...result,
        documentId,
        id: result.id || crypto.randomUUID()
      }))
    )
    await tx.done
    
    // Update cache
    this.cache.results.set(documentId, results)
    this.cache.stats = null
  }
}

export const db = new DatabaseService()

