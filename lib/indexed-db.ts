import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { ProcessingStatus, OCRResult } from "@/types"

interface OCRDatabase extends DBSchema {
  queue: {
    key: string
    value: ProcessingStatus
  }
  results: {
    key: string
    value: OCRResult[]
  }
}

class DatabaseService {
  private dbName = "ocr-dashboard"
  private version = 1
  private db: Promise<IDBPDatabase<OCRDatabase>>

  constructor() {
    this.db = this.initDB()
  }

  private async initDB() {
    return openDB<OCRDatabase>(this.dbName, this.version, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("queue")) {
          db.createObjectStore("queue")
        }
        if (!db.objectStoreNames.contains("results")) {
          db.createObjectStore("results")
        }
      },
    })
  }

  async saveToQueue(item: ProcessingStatus) {
    const db = await this.db
    await db.put("queue", item, item.id)
  }

  async removeFromQueue(id: string) {
    const db = await this.db
    await db.delete("queue", id)
  }

  async getQueue(): Promise<ProcessingStatus[]> {
    const db = await this.db
    return db.getAll("queue")
  }

  async saveResults(id: string, results: OCRResult[]) {
    const db = await this.db
    await db.put("results", results, id)
  }

  async getResults(id: string): Promise<OCRResult[] | undefined> {
    const db = await this.db
    return db.get("results", id)
  }

  async clearAll() {
    const db = await this.db
    await db.clear("queue")
    await db.clear("results")
  }
}

export const db = new DatabaseService()

