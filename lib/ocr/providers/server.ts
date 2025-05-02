// OCR settings are imported from server-settings.ts
import { AzureRateLimiter, MistralRateLimiter } from "../rate-limiter";
import { GoogleVisionProvider } from "./google";
import { MicrosoftVisionProvider } from "./microsoft";
import { MistralOCRProvider } from "./mistral";
import type { OCRProvider } from "./types";
import { getServerOCRSettings } from "../server-settings";

// Create a singleton instance of MistralRateLimiter to share across all Mistral providers
const mistralRateLimiter = new MistralRateLimiter();

// Cache for provider instances to avoid recreating them unnecessarily
const providerCache = new Map<string, { provider: OCRProvider, timestamp: number }>();

// Cache TTL in milliseconds (5 seconds)
const PROVIDER_CACHE_TTL = 5000;

/**
 * Create an OCR provider with server-side settings
 * This function should only be called from server components or API routes
 */
export async function createServerOCRProvider(azureRateLimiter: AzureRateLimiter): Promise<OCRProvider> {
  // Get the latest OCR settings from the server
  const settings = await getServerOCRSettings();

  // Determine which API key to use
  let apiKey = settings.apiKey;

  // If using system key, use the server-side environment variable (not NEXT_PUBLIC_)
  if (settings.useSystemKey !== false && (!apiKey || apiKey.length === 0)) {
    apiKey = process.env.OCR_API_KEY || "";
    console.log('[SERVER] Using system API key for', settings.provider);
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
    console.log('[SERVER] Using cached OCR provider for', settings.provider);
    return cachedProvider.provider;
  }

  console.log('[SERVER] Creating new OCR provider:', settings.provider,
              'API Key:', apiKey ? 'Present' : 'Missing',
              'API Key Length:', apiKey ? apiKey.length : 0,
              'Using system key:', settings.useSystemKey !== false);

  let provider: OCRProvider;

  switch (settings.provider) {
    case "google":
      console.log('[SERVER] Creating Google Vision provider');
      provider = new GoogleVisionProvider(updatedSettings);
      break;
    case "microsoft":
      console.log('[SERVER] Creating Microsoft Vision provider');
      provider = new MicrosoftVisionProvider(updatedSettings, azureRateLimiter);
      break;
    case "mistral":
      console.log('[SERVER] Creating Mistral OCR provider');
      // Use the shared mistralRateLimiter instance
      provider = new MistralOCRProvider(updatedSettings, mistralRateLimiter);
      break;
    default:
      console.log('[SERVER] Unsupported OCR provider:', settings.provider);
      throw new Error(`Unsupported OCR provider: ${settings.provider}`);
  }

  // Cache the provider
  providerCache.set(cacheKey, { provider, timestamp: Date.now() });

  return provider;
}
