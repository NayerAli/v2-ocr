import type { OCRResult, OCRSettings } from "@/types";
import { AzureRateLimiter } from "../rate-limiter";
import type { MicrosoftVisionResponse, OCRProvider } from "./types";

export class MicrosoftVisionProvider implements OCRProvider {
  private settings: OCRSettings;
  private rateLimiter: AzureRateLimiter;

  constructor(settings: OCRSettings, rateLimiter: AzureRateLimiter) {
    this.settings = settings;
    this.rateLimiter = rateLimiter;
  }

  async processImage(base64Data: string, signal: AbortSignal, /* fileType?: string */): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      await this.rateLimiter.waitIfLimited();

      // Check if cancelled after rate limit wait
      if (signal.aborted) {
        console.log(`[Process] Processing aborted`);
        throw new Error("Processing aborted");
      }

      const raw = atob(base64Data);
      const arr = new Uint8Array(new ArrayBuffer(raw.length));
      for (let i = 0; i < raw.length; i++) {
        arr[i] = raw.charCodeAt(i);
      }

      const endpoint = `https://${this.settings.region}.api.cognitive.microsoft.com/vision/v3.2/ocr`;
      const url = this.settings.language ? `${endpoint}?language=${this.settings.language}` : endpoint;

      const response = await fetch(url, {
        method: "POST",
        signal,
        headers: {
          "Ocp-Apim-Subscription-Key": this.settings.apiKey,
          "Content-Type": "application/octet-stream",
        },
        body: arr,
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
          throw new Error(`RATE_LIMIT:${retryAfter}`);
        }
        throw new Error(error.error?.message || `Microsoft Vision API error: ${response.status}`);
      }

      const data = await response.json();

      // List of RTL language codes
      const rtlLanguages = new Set([
        'ar', // Arabic
        'he', // Hebrew
        'fa', // Persian/Farsi
        'ur', // Urdu
        'syr', // Syriac
        'n-bh', // N'Ko
        'sam', // Samaritan
        'mend', // Mandaic
        'man', // Mandaean
      ]);

      const detectedLanguage = data.language || this.settings.language || "unknown";
      const isRTL = rtlLanguages.has(detectedLanguage.toLowerCase().split('-')[0]);

      // Reconstruct text
      const text =
        (data as MicrosoftVisionResponse).regions
          ?.map((region) =>
            region.lines
              ?.map((line) => {
                const words = isRTL ? [...line.words].reverse() : line.words;
                return words.map((word) => word.text).join(" ");
              })
              .join("\n")
          )
          .join("\n\n") || "";

      return {
        id: crypto.randomUUID(),
        documentId: "",
        text,
        confidence: 1,
        language: detectedLanguage,
        processingTime: Date.now() - startTime,
        pageNumber: 1,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("RATE_LIMIT:")) {
        const retryAfter = parseInt(error.message.split(":")[1], 10);
        this.rateLimiter.setRateLimit(retryAfter);
        throw error;
      }
      throw new Error(`Microsoft Vision API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Microsoft Vision API doesn't support direct PDF processing
  canProcessPdfDirectly(/* fileSize: number, pageCount?: number */): boolean {
    return false;
  }
}