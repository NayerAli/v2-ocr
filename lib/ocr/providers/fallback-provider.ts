/**
 * Fallback OCR provider that always works
 * This is used when no other provider is available
 */

import type { OCRResult } from "@/types";
import type { OCRProvider } from "./types";
import { infoLog } from "@/lib/log";

/**
 * A simple fallback OCR provider that returns empty results
 * This is used when no other provider is available
 */
export class FallbackOCRProvider implements OCRProvider {
  private readonly name = "fallback";
  private extractedText: string | null = null;

  constructor() {
    infoLog("[OCR] Creating fallback OCR provider");
  }

  /**
   * Set extracted text that will be used instead of OCR
   * This allows the fallback provider to still return useful content
   * when direct PDF text extraction succeeds
   */
  setExtractedText(text: string) {
    this.extractedText = text;
    infoLog(`[OCR] Fallback provider using extracted text (${text.length} chars)`);
  }

  /**
   * Process an image and extract text
   * This is a fallback implementation that returns an empty result
   * or the previously extracted text if available
   */
  async processImage(base64Image: string, signal?: AbortSignal): Promise<OCRResult> {
    // Check if we have pre-extracted text to use
    if (this.extractedText) {
      infoLog(`[OCR] Fallback provider using pre-extracted text (${this.extractedText.length} chars)`);
      
      const result: OCRResult = {
        id: crypto.randomUUID(),
        text: this.extractedText,
        confidence: 0.8, // Higher confidence since it's direct extraction
        language: "en",
        processingTime: 0,
        provider: "pdf-extraction",
        fallback: false
      };
      
      // Clear the extracted text after using it
      this.extractedText = null;
      
      return result;
    }
    
    // Default fallback behavior when no extracted text is available
    infoLog("[OCR] Using fallback OCR provider to process image (no extracted text available)");
    
    // Create a basic result with no text
    const result: OCRResult = {
      id: crypto.randomUUID(),
      text: "No OCR provider was available to process this image. This is a fallback result.",
      confidence: 0,
      language: "en",
      processingTime: 0,
      error: "No valid OCR provider available",
      provider: "fallback",
      fallback: true
    };
    
    return result;
  }

  /**
   * Whether the provider can process PDFs directly
   */
  canProcessPdfDirectly(fileSize: number, pageCount: number): boolean {
    // Fallback provider cannot process PDFs directly
    return false;
  }
}

/**
 * Create a fallback OCR provider
 * This is used when no other provider is available
 */
export function createFallbackOCRProvider(): OCRProvider {
  return new FallbackOCRProvider();
}
