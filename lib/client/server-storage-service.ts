import type { ProcessingStatus, OCRResult } from '@/types'
import type { DatabaseStats } from '@/types/settings'

interface DatabaseErrorResponse {
  error: string;
  isInitializing?: boolean;
  retryAfter?: number;
  details?: {
    attempts?: number;
    error?: string | null;
    type?: string;
  };
}

/**
 * Server-based storage service
 * This replaces the client-side IndexedDB with server API calls
 */
export const serverStorage = {
  /**
   * Get the processing queue from the server
   */
  async getQueue(): Promise<ProcessingStatus[]> {
    try {
      console.log('[ServerStorage] Fetching document queue');
      const response = await fetch('/api/queue')
      
      console.log(`[ServerStorage] Queue response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ServerStorage] Queue error response: ${errorText}`);
        throw new Error(`Failed to fetch queue: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.queue) {
        console.warn('[ServerStorage] Queue response did not contain queue property:', data);
        return [];
      }
      
      console.log(`[ServerStorage] Retrieved ${data.queue.length} documents from queue`);
      return data.queue || [];
    } catch (error) {
      console.error('[ServerStorage] Error fetching queue:', error);
      return [];
    }
  },

  /**
   * Get a specific item from the queue
   */
  async getStatus(id: string): Promise<ProcessingStatus | undefined> {
    try {
      const response = await fetch(`/api/process/${id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }
      const data = await response.json()
      return data.status
    } catch (error) {
      console.error(`Error fetching status for ${id}:`, error)
      return undefined
    }
  },

  /**
   * Remove an item from the queue
   */
  async removeFromQueue(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/queue/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to remove item from queue')
      }
      const data = await response.json()
      return data.success
    } catch (error) {
      console.error(`Error removing item ${id} from queue:`, error)
      return false
    }
  },

  /**
   * Get results for a document
   */
  async getResults(id: string): Promise<OCRResult[]> {
    try {
      console.log(`[ServerStorage] Fetching results for document: ${id}`)
      const response = await fetch(`/api/results/${id}`)
      
      console.log(`[ServerStorage] Response status: ${response.status}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[ServerStorage] Error response: ${errorText}`)
        throw new Error(`Failed to fetch results: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log(`[ServerStorage] Results received:`, data)
      
      if (!data.results || data.results.length === 0) {
        console.warn(`[ServerStorage] No results found for document ${id}`)
        return []
      }
      
      console.log(`[ServerStorage] Returning ${data.results.length} results`)
      return data.results || []
    } catch (error) {
      console.error(`[ServerStorage] Error fetching results for ${id}:`, error)
      throw error
    }
  },

  /**
   * Get database statistics with retry logic for initialization
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: DatabaseErrorResponse | null = null;

    while (retryCount < maxRetries) {
      try {
        const response = await fetch('/api/database/stats');
        if (!response.ok) {
          const errorData = await response.json() as DatabaseErrorResponse;
          lastError = errorData;
          
          if (response.status === 503 && errorData.isInitializing) {
            // If database is initializing, wait and retry
            const retryAfter = errorData.retryAfter || 2;
            console.log(`Database initializing (attempt ${errorData.details?.attempts || retryCount + 1}), retrying in ${retryAfter}s...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            retryCount++;
            continue;
          }
          
          throw new Error(errorData.error || 'Failed to fetch database stats');
        }
        
        const data = await response.json();
        if (!data.stats) {
          throw new Error('Invalid response format');
        }
        
        return data.stats;
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          const message = lastError?.error || (error instanceof Error ? error.message : 'Unknown error');
          const details = lastError?.details ? ` (${JSON.stringify(lastError.details)})` : '';
          console.error('Error fetching database stats:', message + details);
          throw new Error(message);
        }
        retryCount++;
      }
    }

    throw new Error('Failed to fetch database stats after retries');
  }
} 