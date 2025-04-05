import type { ProcessingSettings } from "@/types/settings"
import { settingsService } from "@/lib/settings-service"

/**
 * Fetches processing settings from the server
 * This is used by the processing service to get the latest settings
 */
export async function getServerProcessingSettings(): Promise<ProcessingSettings> {
  // Default settings to use as fallback
  const DEFAULT_SETTINGS: ProcessingSettings = {
    maxConcurrentJobs: 2,
    pagesPerChunk: 2,
    concurrentChunks: 1,
    retryAttempts: 2,
    retryDelay: 1000
  };

  try {
    console.log('Server Settings: Getting processing settings')

    // Initialize the settings service first
    console.log('Server Settings: Initializing settings service')
    await settingsService.initialize()

    // Then get the processing settings
    console.log('Server Settings: Fetching processing settings')
    const settings = await settingsService.getProcessingSettings()

    // If settings is null or undefined, use default settings
    const finalSettings = settings || DEFAULT_SETTINGS

    // Log the settings with a clear identifier
    console.log('=== SERVER SETTINGS: Retrieved processing settings ===', JSON.stringify(finalSettings, null, 2))
    return finalSettings
  } catch (error) {
    console.error('[ServerSettings] Error fetching processing settings:', error)

    // Return default settings if there's an error
    console.log('Server Settings: Error, returning default settings')
    return DEFAULT_SETTINGS
  }
}
