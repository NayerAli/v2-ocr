import { db as indexedDB } from './indexed-db'
import { supabaseDB, getSupabaseDB } from './supabase-db'
import { isSupabaseEnabled } from './supabase'
import type { DatabaseSettings, DatabaseStats } from '@/types/settings'

export type DatabaseProvider = 'local' | 'supabase'
export type ReconnectionState = 'idle' | 'connecting' | 'success' | 'error';

// Base interface for database services
export interface DatabaseService {
  getQueue(): Promise<any[]>;
  getResults(documentId: string): Promise<any[]>;
  saveToQueue(status: any): Promise<void>;
  saveResults(documentId: string, results: any[]): Promise<void>;
  removeFromQueue(id: string): Promise<void>;
  getDatabaseStats(): Promise<DatabaseStats>;
  cleanupOldRecords(retentionPeriod: number): Promise<number | undefined>;
  clearDatabase(type?: 'queue' | 'results' | 'all'): Promise<void>;
  getSettings?(key: string): Promise<Record<string, any> | null>;
  saveSettings?(key: string, value: Record<string, any>): Promise<boolean>;
  // New reconnection methods (optional for providers that don't support online/offline)
  reconnect?(): Promise<boolean>;
  getReconnectionState?(): ReconnectionState;
  onReconnectionStateChange?(listener: (state: ReconnectionState) => void): () => void;
}

// Factory function to get the appropriate database service
export function getDatabaseService(provider?: DatabaseProvider): DatabaseService {
  if (provider === 'supabase') {
    if (!isSupabaseEnabled()) {
      throw new Error('Supabase is not enabled. Check your environment variables.')
    }
    return getSupabaseDB()
  }
  
  // Default to IndexedDB if no provider specified or provider is 'local'
  return indexedDB
}

// Function to determine if switching database providers is possible
export function canSwitchProvider(to: DatabaseProvider): boolean {
  if (to === 'supabase') {
    return isSupabaseEnabled()
  }
  
  // Always can switch to local
  return true
}

// Function to get current active provider based on environment
export function getActiveProvider(settings: DatabaseSettings): DatabaseProvider {
  // If Supabase is enabled and user settings prefer it, use it
  if (isSupabaseEnabled() && settings.preferredProvider === 'supabase') {
    return 'supabase'
  }
  
  // Default to local
  return 'local'
} 