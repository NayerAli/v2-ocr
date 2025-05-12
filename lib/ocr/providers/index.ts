import type { OCRSettings } from "@/types";
import { AzureRateLimiter, MistralRateLimiter } from "../rate-limiter";
import { GoogleVisionProvider } from "./google";
import { MicrosoftVisionProvider } from "./microsoft";
import { MistralOCRProvider } from "./mistral";
import { createFallbackOCRProvider } from "./fallback-provider";
import type { OCRProvider } from "./types";
import { userSettingsService } from "@/lib/user-settings-service";
import { infoLog } from "@/lib/log";

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
    // But ensure we don't override useSystemKey from the original settings if it's explicitly set
    const useSystemKey = settings.useSystemKey !== undefined ? settings.useSystemKey : latestSettings.useSystemKey;
    
    settings = { 
      ...settings, 
      ...latestSettings,
      useSystemKey // Ensure consistent useSystemKey value
    };
    
    infoLog('[DEBUG] Using latest OCR settings from user settings service', {
      provider: settings.provider,
      apiKeyLength: settings.apiKey ? settings.apiKey.length : 0,
      useSystemKey: settings.useSystemKey
    });
  } catch (error) {
    infoLog('[DEBUG] Failed to get latest OCR settings, using provided settings:', error);
    // Continue with the provided settings if we can't get the latest
  }

  // Create the provider with the latest settings
  return createOCRProvider(settings, azureRateLimiter);
}

/**
 * Create an OCR provider with the given settings
 */
export function createOCRProvider(settings: OCRSettings, azureRateLimiter: AzureRateLimiter): OCRProvider {
  // Normalize settings first
  const normalizedSettings = { ...settings };
  
  // Normalize useSystemKey: default to true if API key is missing or empty
  if (normalizedSettings.apiKey === undefined || normalizedSettings.apiKey === '') {
    normalizedSettings.useSystemKey = true;
  }
  
  // Ensure useSystemKey is a boolean
  normalizedSettings.useSystemKey = normalizedSettings.useSystemKey !== false;
  
  // Always prioritize server-side API keys for better security
  let apiKey = normalizedSettings.apiKey || '';

  // Check for environment variables
  const serverApiKey = process.env.OCR_API_KEY || "";
  const defaultApiKey = process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || "";

  // Provider-specific environment variables (more secure)
  const googleApiKey = process.env.GOOGLE_VISION_API_KEY || "";
  const microsoftApiKey = process.env.MICROSOFT_VISION_API_KEY || "";
  const mistralApiKey = process.env.MISTRAL_API_KEY || "";

  // If using system key or no key is provided, use the appropriate environment variable
  if (normalizedSettings.useSystemKey || !apiKey) {
    // First try provider-specific keys
    if (normalizedSettings.provider === "google" && googleApiKey) {
      apiKey = googleApiKey;
      infoLog('[DEBUG] Using Google-specific API key from environment');
    } else if (normalizedSettings.provider === "microsoft" && microsoftApiKey) {
      apiKey = microsoftApiKey;
      infoLog('[DEBUG] Using Microsoft-specific API key from environment');
    } else if (normalizedSettings.provider === "mistral" && mistralApiKey) {
      apiKey = mistralApiKey;
      infoLog('[DEBUG] Using Mistral-specific API key from environment');
    }
    // Then try generic server key
    else if (serverApiKey) {
      apiKey = serverApiKey;
      infoLog('[DEBUG] Using server-side OCR API key from environment');
    }
    // Finally fall back to public key
    else if (defaultApiKey) {
      apiKey = defaultApiKey;
      infoLog('[DEBUG] Using public OCR API key from environment');
    } else {
      infoLog('[DEBUG] No API key available for', normalizedSettings.provider);
    }
  }

  // Create a new settings object with the potentially updated API key
  const updatedSettings = {
    ...normalizedSettings,
    apiKey
  };

  // Generate a cache key based on the provider and API key
  const cacheKey = `${normalizedSettings.provider}-${apiKey}`;

  // Check if we have a cached provider that's still valid
  const cachedProvider = providerCache.get(cacheKey);
  if (cachedProvider && (Date.now() - cachedProvider.timestamp) < PROVIDER_CACHE_TTL) {
    infoLog('[DEBUG] Using cached OCR provider for', normalizedSettings.provider);
    return cachedProvider.provider;
  }

  infoLog('[DEBUG] Creating new OCR provider:', normalizedSettings.provider,
              'API Key:', apiKey ? 'Present' : 'Missing',
              'API Key Length:', apiKey ? apiKey.length : 0,
              'Using system key:', normalizedSettings.useSystemKey);

  let provider: OCRProvider;

  try {
    switch (normalizedSettings.provider) {
      case "google":
        infoLog('[DEBUG] Creating Google Vision provider');
        provider = new GoogleVisionProvider(updatedSettings);
        break;
      case "microsoft":
        infoLog('[DEBUG] Creating Microsoft Vision provider');
        if (!azureRateLimiter) {
          infoLog('[ERROR] AzureRateLimiter is not defined. Falling back to fallback OCR provider.');
          provider = createFallbackOCRProvider();
          break;
        }
        provider = new MicrosoftVisionProvider(updatedSettings, azureRateLimiter);
        break;
      case "mistral":
        infoLog('[DEBUG] Creating Mistral OCR provider');
        // Use the shared mistralRateLimiter instance
        provider = new MistralOCRProvider(updatedSettings, mistralRateLimiter);
        break;
      default:
        infoLog('[DEBUG] Unsupported OCR provider:', normalizedSettings.provider);
        infoLog('[OCR] Creating fallback OCR provider');
        provider = createFallbackOCRProvider();
    }

    // No need to check for missing API key if useSystemKey is true
    if (!normalizedSettings.useSystemKey && provider && 'settings' in provider && (!provider.settings?.apiKey || provider.settings.apiKey.length === 0)) {
      infoLog('[DEBUG] Provider created but missing API key. Using fallback provider instead.');
      infoLog('[OCR] Creating fallback OCR provider');
      provider = createFallbackOCRProvider();
    }
  } catch (error) {
    infoLog('[DEBUG] Error creating OCR provider:', error);
    infoLog('[DEBUG] Using fallback OCR provider due to error');
    infoLog('[OCR] Creating fallback OCR provider');
    provider = createFallbackOCRProvider();
  }

  // Cache the provider
  providerCache.set(cacheKey, { provider, timestamp: Date.now() });

  return provider;
}