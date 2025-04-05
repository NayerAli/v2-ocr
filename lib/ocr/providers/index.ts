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
  console.log('[DEBUG] Creating OCR provider:', settings.provider, 'API Key:', settings.apiKey ? 'Present' : 'Missing');

  switch (settings.provider) {
    case "google":
      console.log('[DEBUG] Creating Google Vision provider');
      return new GoogleVisionProvider(settings);
    case "microsoft":
      console.log('[DEBUG] Creating Microsoft Vision provider');
      return new MicrosoftVisionProvider(settings, azureRateLimiter);
    case "mistral":
      console.log('[DEBUG] Creating Mistral OCR provider');
      // Use the shared mistralRateLimiter instance
      return new MistralOCRProvider(settings, mistralRateLimiter);
    default:
      console.log('[DEBUG] Unsupported OCR provider:', settings.provider);
      throw new Error(`Unsupported OCR provider: ${settings.provider}`);
  }
}