import type { OCRSettings } from "@/types";
import { AzureRateLimiter, MistralRateLimiter } from "../rate-limiter";
import { GoogleVisionProvider } from "./google";
import { MicrosoftVisionProvider } from "./microsoft";
import { MistralOCRProvider } from "./mistral";
import type { OCRProvider } from "./types";
import { userSettingsService } from "@/lib/user-settings-service";
import { systemSettingsService } from "@/lib/system-settings-service";

// Ensure this module runs only on the server
if (typeof window !== 'undefined') {
  throw new Error('OCR providers must be used on the server');
}

export * from "./types";

// Create a singleton instance of MistralRateLimiter to share across all Mistral providers
const mistralRateLimiter = new MistralRateLimiter();

// Cache for provider instances to avoid recreating them unnecessarily
const providerCache = new Map<string, { provider: OCRProvider, timestamp: number }>();

// Cache TTL in milliseconds (5 seconds)
const PROVIDER_CACHE_TTL = 5000;

/**
 * Create an OCR provider with the latest settings
 * This function will always use the most up-to-date API key
 */
export async function createOCRProviderWithLatestSettings(settings: OCRSettings, azureRateLimiter: AzureRateLimiter): Promise<OCRProvider> {
  // Try to get the latest OCR settings from the user settings service
  try {
    // Clear the user settings cache to ensure we get the latest settings
    userSettingsService.clearCache();

    // Get the latest OCR settings
    const latestSettings = await userSettingsService.getOCRSettings();

    // Merge with provided settings, prioritizing the latest settings
    settings = { ...settings, ...latestSettings };
    console.log('[DEBUG] Using latest OCR settings from user settings service');
  } catch (error) {
    console.log('[DEBUG] Failed to get latest OCR settings, using provided settings:', error);
    // Continue with the provided settings if we can't get the latest
  }

  // Create the provider with the latest settings
  return await createOCRProvider(settings, azureRateLimiter);
}

/**
 * Create an OCR provider with the given settings
 */
export async function createOCRProvider(settings: OCRSettings, azureRateLimiter: AzureRateLimiter): Promise<OCRProvider> {
  // If using system key, retrieve defaults from the server
  let apiKey = settings.apiKey;
  if (settings.useSystemKey !== false && (!apiKey || apiKey.length === 0)) {
    const defaults = await systemSettingsService.getOCRDefaults();
    apiKey = defaults.apiKey;
    settings = {
      ...settings,
      provider: defaults.provider as OCRSettings['provider'],
      region: defaults.region || '',
      language: defaults.language || settings.language
    };
    console.log('[DEBUG] Using system defaults for', settings.provider, 'Default key present:', !!apiKey);
  }

  // Create a new settings object with the potentially updated API key
  const updatedSettings = {
    ...settings,
    apiKey
  };

  // Generate a cache key based on the provider and API key
  const cacheKey = `${settings.provider}-${apiKey}`;

  // Check if we have a cached provider that's still valid
  const cachedProvider = providerCache.get(cacheKey);
  if (cachedProvider && (Date.now() - cachedProvider.timestamp) < PROVIDER_CACHE_TTL) {
    console.log('[DEBUG] Using cached OCR provider for', settings.provider);
    return cachedProvider.provider;
  }

  console.log('[DEBUG] Creating new OCR provider:', settings.provider,
              'API Key:', apiKey ? 'Present' : 'Missing',
              'API Key Length:', apiKey ? apiKey.length : 0,
              'Using system key:', settings.useSystemKey !== false);

  let provider: OCRProvider;

  switch (settings.provider) {
    case "google":
      console.log('[DEBUG] Creating Google Vision provider');
      provider = new GoogleVisionProvider(updatedSettings);
      break;
    case "microsoft":
      console.log('[DEBUG] Creating Microsoft Vision provider');
      provider = new MicrosoftVisionProvider(updatedSettings, azureRateLimiter);
      break;
    case "mistral":
      console.log('[DEBUG] Creating Mistral OCR provider');
      // Use the shared mistralRateLimiter instance
      provider = new MistralOCRProvider(updatedSettings, mistralRateLimiter);
      break;
    default:
      console.log('[DEBUG] Unsupported OCR provider:', settings.provider);
      throw new Error(`Unsupported OCR provider: ${settings.provider}`);
  }

  // Cache the provider
  providerCache.set(cacheKey, { provider, timestamp: Date.now() });

  return provider;
}