import type { ProcessingSettings } from '@/types/settings'
import { systemSettingsService } from './system-settings-service'

// Default processing settings
const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
}

/**
 * Service for managing application settings in Supabase
 * This is a legacy service that uses the new system-settings-service for backward compatibility
 */
class SettingsService {
  constructor() {
    // Constructor
  }

  /**
   * Initialize the settings service
   * This is a no-op in the new implementation as system settings are initialized by the database
   */
  async initialize() {
    // No-op - system settings are initialized by the database
    console.log('Settings service initialization is now handled by the database');
    return;
  }

  /**
   * Get processing settings from Supabase
   */
  async getProcessingSettings(): Promise<ProcessingSettings> {
    try {
      // Use the new system settings service
      return await systemSettingsService.getProcessingSettings()
    } catch (error) {
      console.error('Error in getProcessingSettings:', error)
      return DEFAULT_PROCESSING_SETTINGS
    }
  }

  // These methods are no longer needed as we're using the system_settings table
  // which is created and managed by the database schema

  /**
   * Update processing settings in Supabase
   * This should only be called by admin users or server-side code
   */
  async updateProcessingSettings(settings: Partial<ProcessingSettings>): Promise<void> {
    try {
      // Use the new system settings service
      await systemSettingsService.updateProcessingSettings(settings)
    } catch (error) {
      console.error('Error in updateProcessingSettings:', error)
    }
  }
}

// Create a singleton instance of the settings service
const settingsServiceInstance = new SettingsService()

// Don't initialize the settings service immediately
// It will be initialized when needed

// Export the singleton instance
export const settingsService = settingsServiceInstance
