import type { OCRResult, OCRSettings } from "@/types";
import { getUUID } from "@/lib/uuid";
import type { OCRProvider } from "./types";

export class GoogleVisionProvider implements OCRProvider {
  private settings: OCRSettings;

  constructor(settings: OCRSettings) {
    this.settings = settings;
  }

  async processImage(base64Data: string, signal: AbortSignal, /* fileType?: string */): Promise<OCRResult> {
    const startTime = Date.now();

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.settings.apiKey}`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data,
            },
            features: [
              {
                type: "TEXT_DETECTION",
              },
            ],
            imageContext: this.settings.language
              ? {
                languageHints: [this.settings.language],
              }
              : undefined,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Google Vision API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.responses[0];

    if (!result?.fullTextAnnotation) {
      return {
        id: getUUID(),
        documentId: "",
        text: "",
        confidence: 0,
        language: this.settings.language || "unknown",
        processingTime: Date.now() - startTime,
        pageNumber: 1,
      };
    }

    return {
      id: getUUID(),
      documentId: "",
      text: result.fullTextAnnotation.text,
      confidence: result.fullTextAnnotation.pages?.[0]?.confidence || 1,
      language: result.textAnnotations?.[0]?.locale || this.settings.language || "unknown",
      processingTime: Date.now() - startTime,
      pageNumber: 1,
    };
  }

  // Google Vision API doesn't support direct PDF processing
  canProcessPdfDirectly(/* fileSize: number, pageCount?: number */): boolean {
    return false;
  }
}
