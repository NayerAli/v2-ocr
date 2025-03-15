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
      const response = await fetch('/api/queue')
      if (!response.ok) {
        throw new Error('Failed to fetch queue')
      }
      const data = await response.json()
      return data.queue || []
    } catch (error) {
      console.error('Error fetching queue:', error)
      return []
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
      const response = await fetch(`/api/results/${id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch results')
      }
      const data = await response.json()
      return data.results || []
    } catch (error) {
      console.error(`Error fetching results for ${id}:`, error)
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