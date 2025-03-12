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
  switch (settings.provider) {
    case "google":
      return new GoogleVisionProvider(settings);
    case "microsoft":
      return new MicrosoftVisionProvider(settings, azureRateLimiter);
    case "mistral":
      // Use the shared mistralRateLimiter instance
      return new MistralOCRProvider(settings, mistralRateLimiter);
    default:
      throw new Error(`Unsupported OCR provider: ${settings.provider}`);
  }
} 