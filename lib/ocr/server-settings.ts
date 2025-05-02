import type { ProcessingSettings } from "@/types/settings"
import type { OCRSettings } from "@/types"
import { settingsService } from "@/lib/settings-service"
import { userSettingsService } from "@/lib/user-settings-service"

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
  } catch {
    // Return default settings if there's an error
    return DEFAULT_SETTINGS
  }
}

/**
 * Get OCR settings from the server
 * This function should only be called from server components
 */
export async function getServerOCRSettings(): Promise<OCRSettings> {
  // Clear the cache to ensure we get the latest settings
  userSettingsService.clearCache();

  // Get the latest OCR settings
  return await userSettingsService.getOCRSettings();
}

/**
 * Validate OCR settings on the server
 * This function should only be called from server components
 */
export async function validateServerOCRSettings(): Promise<{
  isConfigured: boolean;
  apiKeyMissing: boolean;
  missingRequirements: string[];
}> {
  const settings = await getServerOCRSettings();

  const missingRequirements: string[] = [];

  // Check if API key is missing and not using system key
  const apiKeyMissing = !settings.apiKey || settings.apiKey.length === 0;
  if (apiKeyMissing && settings.useSystemKey !== true) {
    missingRequirements.push('API key');
  }

  // Check if Azure region is missing for Microsoft provider
  if (settings.provider === "microsoft" && !settings.region) {
    missingRequirements.push('Azure region');
  }

  return {
    isConfigured: missingRequirements.length === 0,
    apiKeyMissing,
    missingRequirements
  };
}

/**
 * Validate OCR provider on the server
 * This function should only be called from server components
 */
export async function validateServerOCRProvider(): Promise<{
  isValid: boolean;
  provider: string;
  reason?: string;
}> {
  const settings = await getServerOCRSettings();

  // Determine which API key to use
  let apiKey = settings.apiKey;

  if (settings.useSystemKey !== false && (!apiKey || apiKey.length === 0)) {
    apiKey = process.env.OCR_API_KEY || "";
  }

  // Check if the API key is valid
  if (!apiKey || apiKey.length === 0) {
    return {
      isValid: false,
      provider: settings.provider,
      reason: "Missing API key"
    };
  }

  // Additional provider-specific validation
  if (settings.provider === "microsoft" && !settings.region) {
    return {
      isValid: false,
      provider: settings.provider,
      reason: "Missing Azure region"
    };
  }

  return {
    isValid: true,
    provider: settings.provider
  };
}
