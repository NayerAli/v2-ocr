import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { ProcessingStatus, OCRResult } from '@/types';
import type { DatabaseStats } from '@/types/settings';
import { supabase, withSupabaseFallback, isSupabaseAvailable } from '../supabase';
import { setupSupabaseSchema } from './setup-supabase';

// Define the database directory (for fallback file-based storage)
const DB_DIR = path.join(process.cwd(), '.db');
const QUEUE_DIR = path.join(DB_DIR, 'queue');
const RESULTS_DIR = path.join(DB_DIR, 'results');
const METADATA_DIR = path.join(DB_DIR, 'metadata');

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    await fs.mkdir(QUEUE_DIR, { recursive: true });
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    await fs.mkdir(METADATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating database directories:', error);
  }
}

// Initialize flag and promise
let hasInitialized = false;
let initializationPromise: Promise<void> | null = null;
let initializationError: Error | null = null;
let initializationAttempts = 0;
const MAX_INITIALIZATION_ATTEMPTS = 3;
const INITIALIZATION_RETRY_DELAY = 2000; // 2 seconds

// Initialize database at startup
async function initDB() {
  if (hasInitialized) return Promise.resolve();
  if (initializationError && initializationAttempts >= MAX_INITIALIZATION_ATTEMPTS) {
    return Promise.reject(initializationError);
  }
  if (initializationPromise) return initializationPromise;
  
  initializationPromise = (async () => {
    while (initializationAttempts < MAX_INITIALIZATION_ATTEMPTS) {
      try {
        console.log(`Initializing database (attempt ${initializationAttempts + 1}/${MAX_INITIALIZATION_ATTEMPTS})...`);
        
        // Check environment variables
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error('Missing required Supabase environment variables');
        }
        
        // Try to set up Supabase schema first
        const isAvailable = await isSupabaseAvailable();
        if (isAvailable) {
          console.log('Supabase is available, setting up schema...');
          const success = await setupSupabaseSchema();
          if (!success) {
            throw new Error('Failed to set up Supabase schema');
          }
        } else {
          console.log('Supabase is not available, using local file storage');
        }
        
        // Ensure local directories for fallback
        await ensureDirectories();
        
        hasInitialized = true;
        initializationError = null;
        console.log('Database initialized successfully');
        return;
      } catch (error) {
        initializationAttempts++;
        console.error(`Database initialization attempt ${initializationAttempts} failed:`, error);
        
        if (initializationAttempts >= MAX_INITIALIZATION_ATTEMPTS) {
          initializationError = error instanceof Error ? error : new Error('Failed to initialize database');
          initializationPromise = null; // Allow future retries
          throw initializationError;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, INITIALIZATION_RETRY_DELAY));
      }
    }
  })();
  
  return initializationPromise;
}

// Cache for database operations (for fallback file-based storage)
interface CacheData {
  queue: ProcessingStatus[];
  results: Map<string, OCRResult[]>;
  stats: DatabaseStats | null;
  lastQueueUpdate: number;
  lastResultsUpdate: Map<string, number>;
  lastStatsUpdate: number;
}

const cache: CacheData = {
  queue: [],
  results: new Map(),
  stats: null,
  lastQueueUpdate: 0,
  lastResultsUpdate: new Map(),
  lastStatsUpdate: 0
};

const CACHE_TTL = 5000; // 5 seconds cache TTL

// Process an OCR result for storage
function processResultForStorage(result: OCRResult) {
  // If the result has an imageUrl as a data URL, we need to handle it
  // For Supabase, we'll upload the image and replace the URL
  if (result.imageUrl && result.imageUrl.startsWith('data:')) {
    // The image will be handled separately when saving the result
    return {
      ...result,
      imageUrl: null // Will be updated after image upload
    };
  }
  
  return result;
}

// Type for Supabase document format
interface SupabaseDocument {
  id: string;
  filename: string;
  status: string;
  progress: number;
  current_page: number;
  total_pages: number;
  size: number;
  type: string;
  start_time: number | null;
  end_time: number | null;
  completion_time: number | null;
  created_at: string;
  updated_at: string;
}

// Type for Supabase result format
interface SupabaseResult {
  id: string;
  document_id: string;
  page: number | null;
  image_url: string | null;
  text: string | null;
  confidence: number | null;
  created_at: string;
}

// Convert Supabase document to ProcessingStatus
function supabaseDocToProcessingStatus(doc: SupabaseDocument): ProcessingStatus {
  return {
    id: doc.id,
    filename: doc.filename,
    status: doc.status as any, // Cast to match the expected enum type
    progress: doc.progress,
    currentPage: doc.current_page,
    totalPages: doc.total_pages,
    size: doc.size,
    type: doc.type,
    startTime: doc.start_time === null ? undefined : doc.start_time,
    endTime: doc.end_time === null ? undefined : doc.end_time,
    completionTime: doc.completion_time === null ? undefined : doc.completion_time,
    createdAt: new Date(doc.created_at),
    updatedAt: new Date(doc.updated_at)
  };
}

// Convert Supabase result to OCRResult
function supabaseResultToOCRResult(result: SupabaseResult): OCRResult {
  // Process result to handle nullable fields properly
  return {
    id: result.id,
    documentId: result.document_id,
    imageUrl: result.image_url === null ? '' : result.image_url,
    text: result.text === null ? '' : result.text,
    confidence: result.confidence === null ? 0 : result.confidence,
    // Add required OCRResult properties with default values since they're not in DB
    language: 'en', // Default language
    processingTime: 0, // Default processing time
    pageNumber: result.page === null ? 0 : result.page
  };
}

interface DatabaseService {
  isInitialized(): Promise<boolean>;
  getInitializationStatus(): { 
    isInitialized: boolean; 
    error: string | null; 
    attempts: number;
  };
  getDatabaseStats(): Promise<DatabaseStats>;
  getQueue(): Promise<ProcessingStatus[]>;
  getQueueItem(id: string): Promise<ProcessingStatus | null>;
  saveToQueue(item: ProcessingStatus): Promise<void>;
  removeFromQueue(id: string): Promise<void>;
  getResults(documentId: string): Promise<OCRResult[]>;
  saveResults(documentId: string, results: OCRResult[]): Promise<void>;
  cleanupOldRecords(retentionPeriod: number): Promise<void>;
  clearDatabase(type?: 'queue' | 'results' | 'all'): Promise<void>;
  getAllFromQueue(): Promise<ProcessingStatus[]>;
  getAll(type: 'queue' | 'results'): Promise<ProcessingStatus[] | OCRResult[]>;
}

// Database service
export const db: DatabaseService = {
  /**
   * Check if the database is initialized
   */
  async isInitialized(): Promise<boolean> {
    if (hasInitialized) return true;
    if (initializationError && initializationAttempts >= MAX_INITIALIZATION_ATTEMPTS) return false;
    
    try {
      await initDB();
      return hasInitialized;
    } catch (error) {
      console.error('Database initialization failed:', error);
      return false;
    }
  },
  
  /**
   * Get initialization status with detailed information
   */
  getInitializationStatus(): { 
    isInitialized: boolean; 
    error: string | null; 
    attempts: number;
  } {
    return {
      isInitialized: hasInitialized,
      error: initializationError?.message || null,
      attempts: initializationAttempts
    };
  },
  
  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    return withSupabaseFallback(
      // Supabase implementation
      async () => {
        // Get queue count
        const { data: documents, error: documentsError } = await supabase
          .from('documents')
          .select('id');
          
        if (documentsError) {
          throw documentsError;
        }
        
        // Get results count
        const { data: results, error: resultsError } = await supabase
          .from('results')
          .select('id');
          
        if (resultsError) {
          throw resultsError;
        }
        
        // Get storage size
        let dbSize = 0;
        try {
          const { data: storageData, error: storageError } = await supabase
            .rpc('get_storage_size', { bucket_name: 'documents' });
          
          if (!storageError && storageData) {
            dbSize = storageData / (1024 * 1024); // Convert to MB
          }
        } catch (error) {
          console.error('Error getting storage size:', error);
          // Continue with dbSize = 0
        }
        
        // Get last cleared date
        const { data: metadataData, error: metadataError } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'lastCleared')
          .single();
          
        let lastCleared: Date | undefined;
        if (!metadataError && metadataData?.value) {
          lastCleared = new Date(metadataData.value as string);
        }
        
        return {
          totalDocuments: documents?.length || 0,
          totalResults: results?.length || 0,
          dbSize,
          lastCleared
        };
      },
      // Fallback file-based implementation
      async () => {
        const now = Date.now();
        if (cache.stats && now - cache.lastStatsUpdate < CACHE_TTL) {
          return cache.stats;
        }
        
        try {
          // Get all queue items
          const queue = await this.getQueue();
          
          // Get all results
          const resultsFiles = await fs.readdir(RESULTS_DIR);
          let totalResults = 0;
          
          for (const file of resultsFiles) {
            if (file.endsWith('.json')) {
              const filePath = path.join(RESULTS_DIR, file);
              const content = await fs.readFile(filePath, 'utf-8');
              const results = JSON.parse(content) as OCRResult[];
              totalResults += results.length;
            }
          }
          
          // Get last cleared date
          let lastCleared: Date | undefined;
          try {
            const metadataPath = path.join(METADATA_DIR, 'lastCleared.json');
            const content = await fs.readFile(metadataPath, 'utf-8');
            lastCleared = new Date(JSON.parse(content));
          } catch (error) {
            // Metadata might not exist yet
          }
          
          // Calculate database size
          const calculateSize = async (dir: string): Promise<number> => {
            const files = await fs.readdir(dir);
            let size = 0;
            
            for (const file of files) {
              const filePath = path.join(dir, file);
              const stats = await fs.stat(filePath);
              size += stats.size;
            }
            
            return size;
          };
          
          const queueSize = await calculateSize(QUEUE_DIR);
          const resultsSize = await calculateSize(RESULTS_DIR);
          const metadataSize = await calculateSize(METADATA_DIR);
          
          const stats: DatabaseStats = {
            totalDocuments: queue.length,
            totalResults,
            dbSize: (queueSize + resultsSize + metadataSize) / (1024 * 1024), // Convert to MB
            lastCleared
          };
          
          // Update cache
          cache.stats = stats;
          cache.lastStatsUpdate = now;
          
          return stats;
        } catch (error) {
          console.error('Error getting database stats:', error);
          return { totalDocuments: 0, totalResults: 0, dbSize: 0 };
        }
      }
    );
  },
  
  /**
   * Clean up old records
   */
  async cleanupOldRecords(retentionPeriod: number): Promise<void> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    await withSupabaseFallback(
      // Supabase implementation
      async () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);
        
        // Delete old documents (which will cascade to results)
        const { error: deleteError } = await supabase
          .from('documents')
          .delete()
          .lt('created_at', cutoffDate.toISOString());
          
        if (deleteError) {
          throw deleteError;
        }
        
        // Update last cleaned date
        const now = new Date();
        const { error: updateError } = await supabase
          .from('settings')
          .upsert({ 
            key: 'lastCleared', 
            value: now.toISOString(),
            updated_at: new Date().toISOString()
          });
          
        if (updateError) {
          throw updateError;
        }
        
        return;
      },
      // Fallback file-based implementation
      async () => {
        try {
          const queue = await this.getQueue();
          const now = new Date();
          const cutoffDate = new Date(now.getTime() - retentionPeriod * 24 * 60 * 60 * 1000);
          
          for (const item of queue) {
            if (item.createdAt && new Date(item.createdAt) < cutoffDate) {
              await this.removeFromQueue(item.id);
              
              // Also remove results
              try {
                const resultsPath = path.join(RESULTS_DIR, `${item.id}.json`);
                await fs.unlink(resultsPath);
                
                // Remove from cache
                cache.results.delete(item.id);
                cache.lastResultsUpdate.delete(item.id);
              } catch (error) {
                // Results might not exist
              }
            }
          }
          
          // Update last cleaned date
          const metadataPath = path.join(METADATA_DIR, 'lastCleared.json');
          await fs.writeFile(metadataPath, JSON.stringify(now));
          
          // Clear cache
          cache.queue = [];
          cache.lastQueueUpdate = 0;
          cache.stats = null;
          cache.lastStatsUpdate = 0;
        } catch (error) {
          console.error('Error cleaning up old records:', error);
        }
      }
    );
  },
  
  /**
   * Clear database
   */
  async clearDatabase(type?: 'queue' | 'results' | 'all'): Promise<void> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    await withSupabaseFallback(
      // Supabase implementation
      async () => {
        if (type === 'queue' || type === 'all') {
          // Delete all documents (will cascade to results)
          const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .neq('id', 'placeholder');
            
          if (deleteError) {
            throw deleteError;
          }
        }
        
        if (type === 'results' || type === 'all') {
          // Delete all results but keep documents
          if (type === 'results') {
            const { error: deleteError } = await supabase
              .from('results')
              .delete()
              .neq('id', 'placeholder');
              
            if (deleteError) {
              throw deleteError;
            }
          }
          
          // Clean up storage files
          const { data: fileList, error: listError } = await supabase.storage
            .from('documents')
            .list();
            
          if (!listError && fileList) {
            for (const file of fileList) {
              await supabase.storage
                .from('documents')
                .remove([file.name]);
            }
          }
        }
        
        // Update last cleared date
        const now = new Date();
        const { error: updateError } = await supabase
          .from('settings')
          .upsert({ 
            key: 'lastCleared', 
            value: now.toISOString(),
            updated_at: new Date().toISOString()
          });
          
        if (updateError) {
          throw updateError;
        }
        
        return;
      },
      // Fallback file-based implementation
      async () => {
        try {
          if (type === 'queue' || type === 'all') {
            const files = await fs.readdir(QUEUE_DIR);
            for (const file of files) {
              await fs.unlink(path.join(QUEUE_DIR, file));
            }
            cache.queue = [];
            cache.lastQueueUpdate = 0;
          }
          
          if (type === 'results' || type === 'all') {
            const files = await fs.readdir(RESULTS_DIR);
            for (const file of files) {
              await fs.unlink(path.join(RESULTS_DIR, file));
            }
            cache.results.clear();
            cache.lastResultsUpdate.clear();
          }
          
          // Update last cleared date
          const metadataPath = path.join(METADATA_DIR, 'lastCleared.json');
          await fs.writeFile(metadataPath, JSON.stringify(new Date()));
          
          // Clear cache
          cache.stats = null;
          cache.lastStatsUpdate = 0;
        } catch (error) {
          console.error('Error clearing database:', error);
        }
      }
    );
  },
  
  /**
   * Get all processing queue items
   */
  async getQueue(): Promise<ProcessingStatus[]> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    return withSupabaseFallback<ProcessingStatus[]>(
      // Supabase implementation
      async () => {
        console.log('[Database] Fetching document queue from Supabase');
        // Fetch all documents including those with error status
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (error) {
          console.error('[Database] Error fetching queue:', error);
          throw error;
        }
        
        console.log(`[Database] Retrieved ${data?.length || 0} documents from Supabase`);
        
        if (!data || data.length === 0) {
          console.warn('[Database] No documents found in Supabase');
          return [];
        }
        
        // Convert from Supabase schema to app schema
        const mappedData = data.map(supabaseDocToProcessingStatus);
        console.log(`[Database] Converted ${mappedData.length} documents to app schema`);
        return mappedData;
      },
      // Fallback file-based implementation
      async () => {
        const now = Date.now();
        if (cache.queue.length > 0 && now - cache.lastQueueUpdate < CACHE_TTL) {
          return [...cache.queue]; // Return a copy to prevent mutation
        }
        
        try {
          const files = await fs.readdir(QUEUE_DIR);
          const queue: ProcessingStatus[] = [];
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(QUEUE_DIR, file);
              const content = await fs.readFile(filePath, 'utf-8');
              const item = JSON.parse(content) as ProcessingStatus;
              
              // Convert dates from strings to Date objects
              if (typeof item.createdAt === 'string') {
                item.createdAt = new Date(item.createdAt);
              }
              if (typeof item.updatedAt === 'string') {
                item.updatedAt = new Date(item.updatedAt);
              }
              
              queue.push(item);
            }
          }
          
          // Sort by creation date (newest first)
          queue.sort((a, b) => {
            const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
            const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
          });
          
          // Update cache
          cache.queue = queue;
          cache.lastQueueUpdate = now;
          
          return [...queue]; // Return a copy to prevent mutation
        } catch (error) {
          console.error('Error getting queue:', error);
          return [];
        }
      }
    );
  },
  
  /**
   * Get a queue item by ID
   */
  async getQueueItem(id: string): Promise<ProcessingStatus | null> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    return withSupabaseFallback<ProcessingStatus | null>(
      // Supabase implementation
      async () => {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', id)
          .single();
          
        if (error || !data) {
          return null;
        }
        
        // Convert from Supabase schema to app schema
        return supabaseDocToProcessingStatus(data);
      },
      // Fallback file-based implementation
      async () => {
        try {
          // Try to get from cache first
          const cachedQueue = cache.queue.find(item => item.id === id);
          if (cachedQueue) {
            return { ...cachedQueue }; // Return a copy to prevent mutation
          }
          
          const filePath = path.join(QUEUE_DIR, `${id}.json`);
          const content = await fs.readFile(filePath, 'utf-8');
          const item = JSON.parse(content) as ProcessingStatus;
          
          // Convert dates from strings to Date objects
          if (typeof item.createdAt === 'string') {
            item.createdAt = new Date(item.createdAt);
          }
          if (typeof item.updatedAt === 'string') {
            item.updatedAt = new Date(item.updatedAt);
          }
          
          return item;
        } catch (error) {
          console.error(`Error getting queue item ${id}:`, error);
          return null;
        }
      }
    );
  },
  
  /**
   * Save to queue
   */
  async saveToQueue(item: ProcessingStatus): Promise<void> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    await withSupabaseFallback(
      // Supabase implementation
      async () => {
        // Make a deep copy to avoid modifying the original
        const itemCopy = JSON.parse(JSON.stringify(item));
        
        // Convert from app schema to Supabase schema
        const supabaseItem = {
          id: itemCopy.id,
          filename: itemCopy.filename,
          status: itemCopy.status,
          progress: itemCopy.progress,
          current_page: itemCopy.currentPage,
          total_pages: itemCopy.totalPages,
          size: itemCopy.size,
          type: itemCopy.type,
          start_time: itemCopy.startTime,
          end_time: itemCopy.endTime,
          completion_time: itemCopy.completionTime,
          created_at: itemCopy.createdAt ? new Date(itemCopy.createdAt).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('documents')
          .upsert(supabaseItem);
          
        if (error) {
          throw error;
        }
        
        return;
      },
      // Fallback file-based implementation
      async () => {
        try {
          // Make a deep copy to avoid modifying the original
          const itemCopy = JSON.parse(JSON.stringify(item));
          
          // Ensure dates are serialized properly
          if (itemCopy.createdAt instanceof Date) {
            itemCopy.createdAt = itemCopy.createdAt.toISOString();
          }
          if (itemCopy.updatedAt instanceof Date) {
            itemCopy.updatedAt = itemCopy.updatedAt.toISOString();
          } else {
            itemCopy.updatedAt = new Date().toISOString();
          }
          
          const filePath = path.join(QUEUE_DIR, `${itemCopy.id}.json`);
          await fs.writeFile(filePath, JSON.stringify(itemCopy, null, 2));
          
          // Update cache
          const existingIndex = cache.queue.findIndex(i => i.id === itemCopy.id);
          if (existingIndex !== -1) {
            cache.queue[existingIndex] = {
              ...itemCopy,
              createdAt: new Date(itemCopy.createdAt),
              updatedAt: new Date(itemCopy.updatedAt)
            };
          } else {
            cache.queue.unshift({
              ...itemCopy,
              createdAt: new Date(itemCopy.createdAt),
              updatedAt: new Date(itemCopy.updatedAt)
            });
          }
          
          // Clear stats cache
          cache.stats = null;
          cache.lastStatsUpdate = 0;
        } catch (error) {
          console.error(`Error saving queue item ${item.id}:`, error);
        }
      }
    );
  },
  
  /**
   * Remove from queue
   */
  async removeFromQueue(id: string): Promise<void> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    await withSupabaseFallback(
      // Supabase implementation
      async () => {
        const { error } = await supabase
          .from('documents')
          .delete()
          .eq('id', id);
          
        if (error) {
          throw error;
        }
        
        return;
      },
      // Fallback file-based implementation
      async () => {
        try {
          const filePath = path.join(QUEUE_DIR, `${id}.json`);
          await fs.unlink(filePath);
          
          // Update cache
          cache.queue = cache.queue.filter(item => item.id !== id);
          
          // Clear stats cache
          cache.stats = null;
          cache.lastStatsUpdate = 0;
        } catch (error) {
          console.error(`Error removing queue item ${id}:`, error);
        }
      }
    );
  },
  
  /**
   * Get results for a document
   */
  async getResults(documentId: string): Promise<OCRResult[]> {
    if (!hasInitialized) {
      await initDB();
      hasInitialized = true;
    }
    
    return withSupabaseFallback<OCRResult[]>(
      // Supabase implementation
      async () => {
        const { data, error } = await supabase
          .from('results')
          .select('*')
          .eq('document_id', documentId)
          .order('page');
          
        if (error) {
          throw error;
        }
        
        // For each result that has a non-null image_url but not a data URL,
        // get a temporary URL from storage
        const results = await Promise.all(data.map(async (item) => {
          let imageUrl = item.image_url;
          
          if (imageUrl && !imageUrl.startsWith('data:')) {
            // Get a temporary URL for the image
            const { data: signedUrl } = await supabase.storage
              .from('documents')
              .createSignedUrl(imageUrl, 3600); // 1 hour expiry
              
            if (signedUrl?.signedUrl) {
              imageUrl = signedUrl.signedUrl;
            }
          }
          
          // Convert to OCRResult with required fields
          return supabaseResultToOCRResult({
            ...item,
            image_url: imageUrl
          });
        }));
        
        return results;
      },
      // Fallback file-based implementation
      async () => {
        try {
          // Try to get from cache first
          const now = Date.now();
          const cachedResults = cache.results.get(documentId);
          const cachedTimestamp = cache.lastResultsUpdate.get(documentId);
          
          if (cachedResults && cachedTimestamp && now - cachedTimestamp < CACHE_TTL) {
            return [...cachedResults]; // Return a copy to prevent mutation
          }
          
          const filePath = path.join(RESULTS_DIR, `${documentId}.json`);
          const content = await fs.readFile(filePath, 'utf-8');
          const results = JSON.parse(content) as OCRResult[];
          
          // Update cache
          cache.results.set(documentId, results);
          cache.lastResultsUpdate.set(documentId, now);
          
          return [...results]; // Return a copy to prevent mutation
        } catch (error) {
          console.error(`Error getting results for document ${documentId}:`, error);
          return [];
        }
      }
    );
  },
  
  /**
   * Save OCR results for a document
   */
  async saveResults(documentId: string, results: OCRResult[]): Promise<void> {
    try {
      console.log('[Database] Saving results for document:', documentId);
      
      // Format results for database storage
      const formattedResults = results.map(result => ({
        id: result.id,
        document_id: documentId,
        page: result.pageNumber || null,
        text: result.text || '',
        confidence: result.confidence || 0,
        image_url: result.imageUrl || null,
        created_at: new Date().toISOString()
      }));

      if (await isSupabaseAvailable()) {
        const { error } = await supabase
          .from('results')
          .insert(formattedResults);

        if (error) {
          console.error('[Database] Error saving results:', error);
          throw error;
        }
        
        console.log('[Database] Results saved successfully');
      } else {
        // Fallback to file storage
        const resultsPath = path.join(RESULTS_DIR, `${documentId}.json`);
        await fs.writeFile(resultsPath, JSON.stringify(results));
      }

      // Update cache
      cache.results.set(documentId, results);
      cache.lastResultsUpdate.set(documentId, Date.now());
    } catch (error) {
      console.error('[Database] Error saving results:', error);
      throw error;
    }
  },
  
  async getAll(type: 'queue' | 'results'): Promise<ProcessingStatus[] | OCRResult[]> {
    if (type === 'queue') {
      return [...cache.queue];
    } else {
      // For results, flatten all results from all documents into a single array
      return Array.from(cache.results.values()).flat();
    }
  },
  
  async getAllFromQueue(): Promise<ProcessingStatus[]> {
    return this.getAll('queue') as Promise<ProcessingStatus[]>;
  }
}; 