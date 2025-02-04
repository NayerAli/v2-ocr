import { openDB, type IDBPDatabase } from 'idb'
import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'

interface OCRDatabase {
  queue: ProcessingStatus
  results: OCRResult
  metadata: {
    key: string
    value: any
  }
}

class DatabaseService {
  private dbName = "ocr-dashboard"
  private version = 2
  private db: Promise<IDBPDatabase<OCRDatabase>> | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.initDB().catch(console.error)
    }
  }

  private async initDB() {
    try {
      this.db = openDB<OCRDatabase>(this.dbName, this.version, {
        upgrade(db, oldVersion, newVersion) {
          if (oldVersion < 1) {
            db.createObjectStore("queue", { keyPath: 'id' })
            db.createObjectStore("results", { keyPath: 'id' })
          }
          if (oldVersion < 2 && !db.objectStoreNames.contains("metadata")) {
            db.createObjectStore("metadata", { keyPath: 'key' })
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
    
    const queueSize = new Blob([JSON.stringify(queue)]).size
    const resultsSize = new Blob([JSON.stringify(results)]).size
    
    return {
      totalDocuments: queue.length,
      totalResults: results.length,
      dbSize: Math.round((queueSize + resultsSize) / (1024 * 1024)), // Convert to MB
      lastCleared
    }
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

  async saveToQueue(item: ProcessingStatus) {
    if (!this.db) return
    const db = await this.db
    await db.put("queue", {
      ...item,
      updatedAt: new Date()
    })
  }

  async removeFromQueue(id: string) {
    if (!this.db) return
    const db = await this.db
    await db.delete("queue", id)
    const results = await this.getResults(id)
    await Promise.all(results.map(result => db.delete("results", result.id)))
  }

  async getQueue(): Promise<ProcessingStatus[]> {
    if (!this.db) return []
    const db = await this.db
    const queue = await db.getAll("queue")
    return queue.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
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
  }

  async getResults(documentId: string): Promise<OCRResult[]> {
    if (!this.db) return []
    const db = await this.db
    const allResults = await db.getAll("results")
    return allResults.filter(r => r.documentId === documentId)
  }
}

export const db = new DatabaseService()

