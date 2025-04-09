import type { OCRSettings } from "@/types";
import { AzureRateLimiter, MistralRateLimiter } from "../rate-limiter";
import { GoogleVisionProvider } from "./google";
import { MicrosoftVisionProvider } from "./microsoft";
import { MistralOCRProvider } from "./mistral";
import type { OCRProvider } from "./types";

export * from "./types";

// Create a singleton instance of MistralRateLimiter to share across all Mistral providers
const mistralRateLimiter = new MistralRateLimiter();

export function createOCRProvider(settings: OCRSettings, azureRateLimiter: AzureRateLimiter): OCRProvider {
  // If using system key, use the default API key from environment
  let apiKey = settings.apiKey;
  const defaultApiKey = process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || "";

  // Check if we should use the system key
  if (settings.useSystemKey !== false && (!apiKey || apiKey.length === 0)) {
    apiKey = defaultApiKey;
    console.log('[DEBUG] Using system API key for', settings.provider, 'Default key present:', !!defaultApiKey);
  }

  // Create a new settings object with the potentially updated API key
  const updatedSettings = {
    ...settings,
    apiKey
  };

  console.log('[DEBUG] Creating OCR provider:', settings.provider,
              'API Key:', apiKey ? 'Present' : 'Missing',
              'API Key Length:', apiKey ? apiKey.length : 0,
              'Using system key:', settings.useSystemKey !== false);

  switch (settings.provider) {
    case "google":
      console.log('[DEBUG] Creating Google Vision provider');
      return new GoogleVisionProvider(updatedSettings);
    case "microsoft":
      console.log('[DEBUG] Creating Microsoft Vision provider');
      return new MicrosoftVisionProvider(updatedSettings, azureRateLimiter);
    case "mistral":
      console.log('[DEBUG] Creating Mistral OCR provider');
      // Use the shared mistralRateLimiter instance
      return new MistralOCRProvider(updatedSettings, mistralRateLimiter);
    default:
      console.log('[DEBUG] Unsupported OCR provider:', settings.provider);
      throw new Error(`Unsupported OCR provider: ${settings.provider}`);
  }
}