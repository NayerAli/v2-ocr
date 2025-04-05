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
    // Initialize the settings service first
    await settingsService.initialize()

    // Then get the processing settings
    const settings = await settingsService.getProcessingSettings()

    // If settings is null or undefined, use default settings
    const finalSettings = settings || DEFAULT_SETTINGS
    return finalSettings
  } catch (error) {
    // Return default settings if there's an error
    return DEFAULT_SETTINGS
  }
}
