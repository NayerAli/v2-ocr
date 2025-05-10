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

  async processImage(base64Data: string, signal: AbortSignal, fileType?: string, pageNumber: number = 1, totalPages: number = 1): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // Log the base64 data length to help with debugging
      console.log(`[Microsoft] Processing image with base64 length: ${base64Data.length}, page ${pageNumber}/${totalPages}`);

      // Validate base64 data
      if (!base64Data || base64Data.length < 100) {
        console.error('[Microsoft] Invalid base64 data received, length:', base64Data?.length || 0);
        throw new Error('Invalid image data received');
      }

      await this.rateLimiter.waitIfLimited();

      // Check if cancelled after rate limit wait
      if (signal.aborted) {
        console.log(`[Microsoft] Processing aborted`);
        throw new Error("Processing aborted");
      }

      // Ensure the base64 data doesn't have a data URL prefix
      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

      const raw = atob(cleanBase64);
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
        let errorMessage = `Microsoft Vision API error: ${response.status}`;
        try {
          const errorData = await response.json();
          console.error('[Microsoft] API error response:', errorData);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.code || errorMessage;
          }
        } catch (parseError) {
          console.error('[Microsoft] Failed to parse error response:', parseError);
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
          console.log(`[Microsoft] Rate limited (429). Retry after ${retryAfter}s`);
          throw new Error(`RATE_LIMIT:${retryAfter}`);
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[Microsoft] API response received, parsing results');

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
      let text =
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

      // Ensure text is never empty
      if (!text) {
        console.warn('[Microsoft] OCR returned empty text. Setting default message.');
        text = 'No text was extracted from this image. Please try again or use a different OCR provider.';
      }

      // Log success
      console.log(`[Microsoft] Successfully processed image page ${pageNumber}/${totalPages}, text length: ${text.length}`);

      return {
        id: crypto.randomUUID(),
        documentId: "",
        text,
        confidence: 1,
        language: detectedLanguage,
        processingTime: Date.now() - startTime,
        pageNumber: pageNumber,
        totalPages: totalPages,
        provider: "microsoft"
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