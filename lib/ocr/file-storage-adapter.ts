import { uploadFile as uploadToSupabase, downloadFile as downloadFromSupabase } from '../supabase-storage';
import { getDatabaseService } from '../db-factory';
import { useSettings } from '@/store/settings';
import type { ProcessingStatus } from '@/types';

// Cache size limit (50MB)
const FILE_CACHE_SIZE_LIMIT = 50 * 1024 * 1024;

// Cache interface
interface FileCache {
  url: string;
  data: Blob;
  timestamp: number;
  size: number;
}

export interface FileStorage {
  uploadFile: (file: File, documentId: string) => Promise<string | null>;
  downloadFile: (fileUrl: string) => Promise<File | Blob | null>;
  getFileData: (status: ProcessingStatus) => Promise<File | Blob | null>;
  clearCache: () => Promise<void>;
}

/**
 * Creates a file storage adapter based on current settings
 * Handles uploading, downloading, and retrieving files from either
 * local storage or Supabase storage
 */
export function createFileStorageAdapter(): FileStorage {
  const settings = useSettings.getState();
  const isUsingSupabase = settings.database.preferredProvider === 'supabase';
  
  /**
   * Local storage implementation (using File references directly)
   */
  const localStorage: FileStorage = {
    // For local storage, we don't really "upload" - we just return null
    // and rely on the File object being stored in the status object
    uploadFile: async () => null,
    
    // For local storage, download is a no-op (files are kept in memory)
    downloadFile: async () => null,
    
    // Simply return the file from the status object
    getFileData: async (status) => status.file || null,
    
    // No cache to clear for local storage
    clearCache: async () => {}
  };
  
  /**
   * Supabase storage implementation with offline caching
   */
  const supabaseStorage: FileStorage = {
    // Upload to Supabase storage and return the public URL
    uploadFile: async (file, documentId) => {
      try {
        // Get user ID from settings if available
        const userId = settings.userId || 'anonymous';
        
        // Upload to a path based on user ID and document ID
        const path = `${userId}/documents/${documentId}`;
        
        // Upload file to Supabase
        const url = await uploadToSupabase(file, path);
        
        if (!url) {
          console.error('Failed to upload file to Supabase');
          return null;
        }
        
        // Cache the file locally for offline access
        await cacheFile(url, file);
        
        console.log(`[Storage] Uploaded file to Supabase: ${url}`);
        return url;
      } catch (error) {
        console.error('[Storage] Error uploading file to Supabase:', error);
        return null;
      }
    },
    
    // Download file from Supabase storage using the URL with caching
    downloadFile: async (fileUrl) => {
      try {
        if (!fileUrl) return null;
        
        // Check if file is in cache
        const cachedFile = await getCachedFile(fileUrl);
        if (cachedFile) {
          console.log(`[Storage] Using cached file: ${fileUrl}`);
          return cachedFile;
        }
        
        // If not in cache and offline, return null
        if (!navigator.onLine) {
          console.warn('[Storage] Device is offline and file not in cache');
          return null;
        }
        
        // Download file from Supabase
        const blob = await downloadFromSupabase(fileUrl);
        
        if (!blob) {
          console.error('Failed to download file from Supabase');
          return null;
        }
        
        // Cache the downloaded file
        await cacheFile(fileUrl, blob);
        
        return blob;
      } catch (error) {
        console.error('[Storage] Error downloading file from Supabase:', error);
        return null;
      }
    },
    
    // Get file data from status object or download from URL
    getFileData: async (status) => {
      // If file is already available, use it
      if (status.file) {
        // Cache the file for future offline access if we have a URL
        if (status.fileUrl) {
          await cacheFile(status.fileUrl, status.file);
        }
        return status.file;
      }
      
      // If we have a URL, try to get from cache or download
      if (status.fileUrl) {
        return supabaseStorage.downloadFile(status.fileUrl);
      }
      
      return null;
    },
    
    // Clear the file cache
    clearCache: async () => {
      try {
        localStorage.removeItem('file-cache-index');
        const cacheIndex = await getFileCache();
        
        // Remove all cached files
        for (const url of Object.keys(cacheIndex)) {
          localStorage.removeItem(`file-cache:${btoa(url)}`);
        }
        
        console.log('[Storage] File cache cleared');
      } catch (error) {
        console.error('[Storage] Error clearing file cache:', error);
      }
    }
  };
  
  // Return the appropriate storage adapter based on settings
  return isUsingSupabase ? supabaseStorage : localStorage;
}

// File cache utilities

/**
 * Get the file cache index
 */
async function getFileCache(): Promise<Record<string, { timestamp: number, size: number }>> {
  try {
    const cacheIndex = localStorage.getItem('file-cache-index');
    if (cacheIndex) {
      return JSON.parse(cacheIndex);
    }
  } catch (error) {
    console.warn('[Storage] Error retrieving file cache index:', error);
  }
  return {};
}

/**
 * Save the file cache index
 */
async function saveFileCache(cacheIndex: Record<string, { timestamp: number, size: number }>) {
  try {
    localStorage.setItem('file-cache-index', JSON.stringify(cacheIndex));
  } catch (error) {
    console.warn('[Storage] Error saving file cache index:', error);
  }
}

/**
 * Get a file from the cache
 */
async function getCachedFile(url: string): Promise<Blob | null> {
  try {
    const cacheIndex = await getFileCache();
    const cacheInfo = cacheIndex[url];
    
    if (!cacheInfo) {
      return null;
    }
    
    // Check if cache is stale (older than 7 days)
    const isStale = Date.now() - cacheInfo.timestamp > 7 * 24 * 60 * 60 * 1000;
    if (isStale) {
      // Remove from cache if stale
      delete cacheIndex[url];
      await saveFileCache(cacheIndex);
      localStorage.removeItem(`file-cache:${btoa(url)}`);
      return null;
    }
    
    // Get file data from cache
    const cacheKey = `file-cache:${btoa(url)}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }
    
    // Convert base64 data to Blob
    const binaryData = atob(cachedData);
    const arrayBuffer = new ArrayBuffer(binaryData.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < binaryData.length; i++) {
      uint8Array[i] = binaryData.charCodeAt(i);
    }
    
    // Update cache timestamp (accessed recently)
    cacheIndex[url].timestamp = Date.now();
    await saveFileCache(cacheIndex);
    
    return new Blob([arrayBuffer]);
  } catch (error) {
    console.warn('[Storage] Error retrieving file from cache:', error);
    return null;
  }
}

/**
 * Cache a file for offline access
 */
async function cacheFile(url: string, file: File | Blob): Promise<void> {
  try {
    // Get current cache index
    const cacheIndex = await getFileCache();
    
    // Check current cache size
    let totalSize = Object.values(cacheIndex).reduce((size, item) => size + item.size, 0);
    
    // If cache is full, remove oldest items
    if (totalSize > FILE_CACHE_SIZE_LIMIT) {
      const entries = Object.entries(cacheIndex);
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest files until we have enough space
      while (totalSize > FILE_CACHE_SIZE_LIMIT * 0.8 && entries.length > 0) {
        const [oldestUrl, oldestItem] = entries.shift()!;
        totalSize -= oldestItem.size;
        localStorage.removeItem(`file-cache:${btoa(oldestUrl)}`);
        delete cacheIndex[oldestUrl];
      }
    }
    
    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    
    // Store file in cache
    const cacheKey = `file-cache:${btoa(url)}`;
    localStorage.setItem(cacheKey, base64Data);
    
    // Update cache index
    cacheIndex[url] = {
      timestamp: Date.now(),
      size: file.size
    };
    await saveFileCache(cacheIndex);
    
    console.log(`[Storage] File cached: ${url}`);
  } catch (error) {
    console.warn('[Storage] Error caching file:', error);
  }
} 