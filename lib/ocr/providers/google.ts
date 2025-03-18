import type { OCRResult, OCRSettings } from "@/types";
import type { OCRProvider } from "./types";
import crypto from "crypto";

export class GoogleVisionProvider implements OCRProvider {
  private apiKey: string;
  private language: string;

  constructor(settings: OCRSettings) {
    console.log('[GoogleVision] Initializing provider:', {
      hasApiKey: !!settings.apiKey,
      language: settings.language
    });
    this.apiKey = settings.apiKey;
    this.language = settings.language || 'en';
  }

  async processImage(base64Data: string, signal: AbortSignal, fileType?: string, pageNumber: number = 1, totalPages: number = 1): Promise<OCRResult> {
    if (!this.apiKey) {
      console.error('[GoogleVision] No API key provided');
      throw new Error('Google Vision API key is required');
    }

    console.log('[GoogleVision] Processing image:', {
      size: base64Data.length,
      language: this.language
    });

    try {
      // No need to convert to base64 as input is already base64
      const base64Image = base64Data;

      // Construct request body
      const body = {
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 1
              }
            ],
            imageContext: {
              languageHints: [this.language]
            }
          }
        ]
      };

      // Send request to Google Vision API
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('[GoogleVision] API request failed:', error);
        throw new Error(`Google Vision API request failed: ${error}`);
      }

      const data = await response.json();
      console.log('[GoogleVision] Received response:', {
        hasText: !!data.responses?.[0]?.fullTextAnnotation,
        confidence: data.responses?.[0]?.fullTextAnnotation?.pages?.[0]?.confidence
      });

      // Extract text from response
      const textAnnotation = data.responses[0]?.fullTextAnnotation;
      if (!textAnnotation) {
        return {
          id: crypto.randomUUID(),
          documentId: '',
          text: '',
          confidence: 0,
          language: this.language,
          processingTime: 0,
          pageNumber: pageNumber,
          totalPages: totalPages
        };
      }

      return {
        id: crypto.randomUUID(),
        documentId: '',  // Will be filled by caller
        text: textAnnotation.text,
        confidence: textAnnotation.pages?.[0]?.confidence || 0,
        language: textAnnotation.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode || this.language,
        processingTime: 0,
        pageNumber: pageNumber,
        totalPages: totalPages
      };
    } catch (error) {
      console.error('[GoogleVision] Error processing image:', error);
      throw error;
    }
  }

  // Google Vision API doesn't support direct PDF processing
  canProcessPdfDirectly(fileSize: number, pageCount?: number): boolean {
    return false;
  }
}