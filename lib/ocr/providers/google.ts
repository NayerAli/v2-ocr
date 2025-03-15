import type { OCRResult, OCRSettings } from "@/types";
import type { OCRProvider } from "./types";

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

  async processImage(imageData: ArrayBuffer): Promise<OCRResult[]> {
    if (!this.apiKey) {
      console.error('[GoogleVision] No API key provided');
      throw new Error('Google Vision API key is required');
    }

    console.log('[GoogleVision] Processing image:', {
      size: imageData.byteLength,
      language: this.language
    });

    try {
      // Convert image data to base64
      const base64Image = Buffer.from(imageData).toString('base64');

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
        return [];
      }

      return [{
        text: textAnnotation.text,
        confidence: textAnnotation.pages?.[0]?.confidence || 0,
        language: textAnnotation.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode || this.language
      }];
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