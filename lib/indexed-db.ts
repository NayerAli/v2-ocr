import { openDB, type IDBPDatabase } from 'idb'
import type { ProcessingStatus, OCRResult } from '@/types'

interface OCRDatabase {
  queue: ProcessingStatus
  results: OCRResult
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
          // Handle version upgrades
          if (oldVersion < 1) {
            // First time setup
            db.createObjectStore("queue", { keyPath: 'id' })
            db.createObjectStore("results", { keyPath: 'id' })
          }
          // Add future version upgrades here if needed
        },
        blocked() {
          // Handle case where older version is still open
          console.warn('Please close other tabs/windows using this app')
        },
        blocking() {
          // Handle case where newer version is trying to take over
          window.location.reload()
        },
      })
    } catch (error) {
      console.error('IndexedDB initialization error:', error)
      this.db = null
    }
  }

  async saveToQueue(item: ProcessingStatus) {
    if (!this.db) return
    const db = await this.db
    await db.put("queue", {
      ...item,
      updatedAt: new Date() // Ensure timestamps are set
    })
  }

  async removeFromQueue(id: string) {
    if (!this.db) return
    const db = await this.db
    const results = await this.getResults(id)
    if (results.length > 0) {
      await db.delete("queue", id)
    }
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

  async clearAll() {
    if (!this.db) return
    const db = await this.db
    await db.clear("queue")
    await db.clear("results")
  }
}

export const db = new DatabaseService()

