import type { OCRResult, OCRSettings } from "@/types";
import type { OCRProvider } from "./types";

export class GoogleVisionProvider implements OCRProvider {
  private settings: OCRSettings;

  constructor(settings: OCRSettings) {
    this.settings = settings;
  }

  async processImage(base64Data: string, signal: AbortSignal, fileType?: string, pageNumber: number = 1, totalPages: number = 1): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // Log the base64 data length to help with debugging
      console.log(`[Google] Processing image with base64 length: ${base64Data.length}, page ${pageNumber}/${totalPages}`);

      // Log file type if provided
      if (fileType) {
        console.log(`[Google] File type: ${fileType}`);
      }

      // Validate and clean base64 data using the utility function
      const { validateAndCleanBase64 } = await import('@/lib/file-utils');
      const cleanBase64 = validateAndCleanBase64(base64Data);

      if (!cleanBase64) {
        console.error('[Google] Invalid base64 data received');
        throw new Error('Invalid image data received');
      }

      console.log(`[Google] Base64 data cleaned, new length: ${cleanBase64.length}`);

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
                content: cleanBase64,
              },
              features: [
                {
                  type: "TEXT_DETECTION",
                  maxResults: 1,
                }, {
                  type: "DOCUMENT_TEXT_DETECTION",
                  maxResults: 1,
                }
              ],
              imageContext: {
                languageHints: this.settings.language ? [this.settings.language] : ['en', 'ar', 'fa', 'ur'],
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        let errorMessage = `Google Vision API error: ${response.status}`;
        try {
          const errorData = await response.json();
          console.error('[Google] API error response:', errorData);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.status || errorMessage;
          }
        } catch (parseError) {
          console.error('[Google] Failed to parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[Google] API response received, parsing results');

      // Log the response structure for debugging
      if (data.responses && data.responses.length > 0) {
        const result = data.responses[0];
        console.log('[Google] Response contains:',
          result.fullTextAnnotation ? 'fullTextAnnotation' : 'no fullTextAnnotation',
          result.textAnnotations ? `textAnnotations (${result.textAnnotations.length})` : 'no textAnnotations'
        );
      } else {
        console.warn('[Google] Empty or invalid response structure');
      }

      const result = data.responses[0];

      // Try both TEXT_DETECTION and DOCUMENT_TEXT_DETECTION results
      let extractedText = '';
      let confidence = 0;

      // First try DOCUMENT_TEXT_DETECTION which is better for scanned documents
      if (result?.fullTextAnnotation?.text) {
        extractedText = result.fullTextAnnotation.text;
        confidence = result.fullTextAnnotation.pages?.[0]?.confidence || 0.8;
        console.log('[Google] Using fullTextAnnotation, text length:', extractedText.length);
      }
      // Fallback to TEXT_DETECTION if DOCUMENT_TEXT_DETECTION fails
      else if (result?.textAnnotations?.[0]?.description) {
        extractedText = result.textAnnotations[0].description;
        confidence = 0.6; // Lower confidence for this method
        console.log('[Google] Using textAnnotations, text length:', extractedText.length);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        console.warn('[Google] OCR returned no text. Setting default message.');

        // Check if we have an error in the response
        if (result?.error) {
          console.error('[Google] Error in response:', result.error);
          return {
            id: crypto.randomUUID(),
            documentId: "",
            text: `OCR processing error: ${result.error.message || 'Unknown error'}`,
            confidence: 0,
            language: this.settings.language || "unknown",
            processingTime: Date.now() - startTime,
            pageNumber: pageNumber,
            totalPages: totalPages,
            error: result.error.message || 'Unknown error',
            provider: "google"
          };
        }

        return {
          id: crypto.randomUUID(),
          documentId: "",
          text: "No text was extracted from this image. Please try again or use a different OCR provider.",
          confidence: 0,
          language: this.settings.language || "unknown",
          processingTime: Date.now() - startTime,
          pageNumber: pageNumber,
          totalPages: totalPages,
          provider: "google"
        };
      }

      // Log success
      console.log(`[Google] Successfully processed image page ${pageNumber}/${totalPages}, text length: ${extractedText.length}`);

      return {
        id: crypto.randomUUID(),
        documentId: "",
        text: extractedText,
        confidence: confidence,
        language: result.textAnnotations?.[0]?.locale || this.settings.language || "unknown",
        processingTime: Date.now() - startTime,
        pageNumber: pageNumber,
        totalPages: totalPages,
        provider: "google"
      };
    } catch (error) {
      console.error('[Google] Error processing image:', error);

      // Return a fallback result with error information
      return {
        id: crypto.randomUUID(),
        documentId: "",
        text: `OCR processing error: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
        language: this.settings.language || "unknown",
        processingTime: Date.now() - startTime,
        pageNumber: pageNumber,
        totalPages: totalPages,
        error: error instanceof Error ? error.message : String(error),
        provider: "google"
      };
    }
  }

  // Google Vision API doesn't support direct PDF processing
  canProcessPdfDirectly(/* fileSize: number, pageCount?: number */): boolean {
    return false;
  }
}