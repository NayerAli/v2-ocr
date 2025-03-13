'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProcessingStatus, OCRResult } from '@/types';
import type { 
  SettingsState, 
  OCRSettings, 
  ProcessingSettings, 
  UploadSettings, 
  DisplaySettings, 
  DatabaseSettings,
  ExportSettings,
  DatabaseStats
} from '@/types/settings';

// Define types for API responses
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Define options for the hook
export interface UseServerApiOptions {
  onError?: (error: Error) => void;
  debounceMs?: number;
}

// Cache for API responses
interface CacheEntry {
  data: any;
  timestamp: number;
}

// Global cache to share between hook instances
const API_CACHE: Record<string, CacheEntry> = {};
const SETTINGS_CACHE_TTL = 30000; // 30 seconds for settings
const DEFAULT_CACHE_TTL = 5000; // 5 seconds for other endpoints

// Track if settings have been loaded
let settingsLoaded = false;

/**
 * Debounce function that returns a promise
 */
function debounce<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timer: NodeJS.Timeout | null = null;
  let pendingPromise: Promise<ReturnType<T>> | null = null;
  
  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // If there's a pending promise for the same function call, return it
    if (pendingPromise) {
      return pendingPromise;
    }
    
    // Create a new promise
    pendingPromise = new Promise<ReturnType<T>>((resolve, reject) => {
      // Clear any existing timer
      if (timer) {
        clearTimeout(timer);
      }
      
      // Set a new timer
      timer = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          timer = null;
          pendingPromise = null;
        }
      }, wait);
    });
    
    return pendingPromise;
  };
}

/**
 * Hook for making API calls to server endpoints
 */
export function useServerApi(options: UseServerApiOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pendingRequests = useRef(new Map<string, AbortController>());
  const { onError, debounceMs = 300 } = options;
  const settingsCache = useRef<any>(null);
  const settingsCacheTime = useRef<number>(0);
  
  const handleError = useCallback((error: Error) => {
    setError(error);
    if (onError) {
      onError(error);
    }
    console.error('API Error:', error);
  }, [onError]);
  
  /**
   * Generic fetch API function with caching
   */
  const fetchApi = useCallback(async <T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    skipCache = false
  ): Promise<T> => {
    // Special handling for settings API
    const isSettingsApi = url === '/api/settings';
    const cacheTtl = isSettingsApi ? SETTINGS_CACHE_TTL : DEFAULT_CACHE_TTL;
    
    // For GET requests, check cache first
    if (method === 'GET' && !skipCache) {
      const cacheKey = url;
      const cachedData = API_CACHE[cacheKey];
      
      if (cachedData && (Date.now() - cachedData.timestamp < cacheTtl)) {
        return cachedData.data;
      }
      
      // For settings API, if we've already loaded it once, don't trigger loading state again
      if (isSettingsApi && settingsLoaded) {
        // Still make the request in the background to refresh cache, but don't show loading
        fetchApi<T>(url, method, body, true).catch(console.error);
        return API_CACHE[cacheKey]?.data;
      }
    }
    
    // Cancel any pending requests to the same URL
    if (pendingRequests.current.has(url)) {
      pendingRequests.current.get(url)?.abort();
      pendingRequests.current.delete(url);
    }
    
    // Create a new abort controller
    const controller = new AbortController();
    pendingRequests.current.set(url, controller);
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      
      // Remove the controller reference
      pendingRequests.current.delete(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache GET responses
      if (method === 'GET') {
        API_CACHE[url] = {
          data,
          timestamp: Date.now(),
        };
        
        // Mark settings as loaded
        if (isSettingsApi) {
          settingsLoaded = true;
        }
      }
      // Invalidate cache for POST/PUT/DELETE to settings
      else if (isSettingsApi) {
        API_CACHE['/api/settings'] = {
          data,
          timestamp: Date.now(),
        };
      }
      
      return data;
    } catch (error: any) {
      // Don't treat aborted requests as errors
      if (error.name === 'AbortError') {
        throw error;
      }
      
      handleError(error instanceof Error ? error : new Error(error?.message || 'Unknown error'));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);
  
  // Create debounced version of fetchApi
  const debouncedFetchApi = useCallback(
    debounce(fetchApi, debounceMs),
    [fetchApi, debounceMs]
  );
  
  // API methods
  const getSettings = useCallback(async () => {
    return debouncedFetchApi('/api/settings');
  }, [debouncedFetchApi]);
  
  const updateSettings = useCallback(async (settings: any) => {
    // Invalidate settings cache
    settingsCache.current = null;
    
    return fetchApi('/api/settings', 'POST', settings);
  }, [fetchApi]);
  
  const resetSettings = useCallback(async () => {
    // Invalidate settings cache
    settingsCache.current = null;
    
    return fetchApi('/api/settings', 'DELETE');
  }, [fetchApi]);
  
  const getQueue = useCallback(async () => {
    return debouncedFetchApi('/api/queue');
  }, [debouncedFetchApi]);
  
  const processFiles = useCallback(async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      if (onError && error instanceof Error) {
        onError(error);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onError]);
  
  const cancelJob = useCallback(async (jobId: string) => {
    return fetchApi(`/api/job/${jobId}/cancel`, 'POST');
  }, [fetchApi]);
  
  const removeJob = useCallback(async (jobId: string) => {
    return fetchApi(`/api/job/${jobId}`, 'DELETE');
  }, [fetchApi]);
  
  const getJobResults = useCallback(async (jobId: string) => {
    return fetchApi(`/api/job/${jobId}/results`);
  }, [fetchApi]);
  
  const clearJobs = useCallback(async () => {
    return fetchApi('/api/queue/clear', 'POST');
  }, [fetchApi]);
  
  // Queue API
  const getQueueItem = useCallback(async (id: string) => {
    return fetchApi<ProcessingStatus>(`/api/queue/${id}`);
  }, [fetchApi]);
  
  const removeQueueItem = useCallback(async (id: string) => {
    return fetchApi<{ success: boolean }>(`/api/queue/${id}`, {
      method: 'DELETE',
    });
  }, [fetchApi]);
  
  const cancelProcessing = useCallback(async (id: string) => {
    return fetchApi<{ success: boolean }>(`/api/queue/${id}?action=cancel`, {
      method: 'POST',
    });
  }, [fetchApi]);
  
  // Results API
  const getResults = useCallback(async (id: string) => {
    return fetchApi<OCRResult[]>(`/api/results/${id}`);
  }, [fetchApi]);
  
  const deleteResults = useCallback(async (id: string) => {
    return fetchApi<{ success: boolean }>(`/api/results/${id}`, {
      method: 'DELETE',
    });
  }, [fetchApi]);
  
  // Database API
  const getDatabaseStats = useCallback(async () => {
    return fetchApi<DatabaseStats>('/api/database');
  }, [fetchApi]);
  
  const cleanupDatabase = useCallback(async () => {
    return fetchApi<{ success: boolean }>('/api/database?action=cleanup', {
      method: 'POST',
    });
  }, [fetchApi]);
  
  const clearDatabase = useCallback(async (type?: 'queue' | 'results' | 'all') => {
    return fetchApi<{ success: boolean }>(`/api/database?type=${type || 'all'}`, {
      method: 'DELETE',
    });
  }, [fetchApi]);
  
  // Process API
  const processFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    return fetchApi<{ id: string; status: ProcessingStatus }>('/api/process', {
      method: 'POST',
      body: formData,
    });
  }, [fetchApi]);
  
  // Clean up pending requests on unmount
  useEffect(() => {
    return () => {
      pendingRequests.current.forEach(controller => {
        controller.abort();
      });
      pendingRequests.current.clear();
    };
  }, []);
  
  return {
    isLoading,
    error,
    // Settings
    getSettings,
    updateSettings,
    resetSettings,
    // Queue
    getQueue,
    getQueueItem,
    removeQueueItem,
    cancelProcessing,
    // Results
    getResults,
    deleteResults,
    // Database
    getDatabaseStats,
    cleanupDatabase,
    clearDatabase,
    // Process
    processFiles,
    cancelJob,
    removeJob,
    getJobResults,
    clearJobs,
  };
} 