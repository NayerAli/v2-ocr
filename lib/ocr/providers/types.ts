// OCR provider types for client usage
import type { OCRResult } from "@/types";
import type { OCRSettings } from "@/types/settings";

/**
 * Generic interface for OCR providers
 */
export interface OCRProvider {
  /**
   * Process an image and extract text
   * @param base64Image Base64-encoded image data
   * @param signal AbortSignal for cancellation
   * @param fileType Optional file type (e.g., 'application/pdf')
   * @param pageNumber Page number in multi-page document (default: 1)
   * @param totalPages Total pages in multi-page document (default: 1)
   */
  processImage(
    base64Image: string,
    signal: AbortSignal,
    fileType?: string,
    pageNumber?: number,
    totalPages?: number
  ): Promise<OCRResult>;

  /**
   * Whether the provider can process PDFs directly (client-side check)
   */
  canProcessPdfDirectly?(fileSize: number, pageCount: number): boolean;

  /**
   * Process a PDF directly (without extracting pages as images first)
   */
  processPdfDirectly?(base64Pdf: string, signal?: AbortSignal): Promise<OCRResult>;
}

/**
 * Provider names
 */
export type OCRProviderName = "azure" | "mistral" | "api" | "ocr.space";

/**
 * Factory function to create providers (client-safe stub)
 * Note: This is just a type definition for client code.
 * Actual provider implementations will be on the server.
 */
export type OCRProviderFactory = (settings: OCRSettings) => Promise<OCRProvider>;

export interface MicrosoftVisionRegion {
  lines: Array<{
    words: Array<{
      text: string
    }>
  }>
}

export interface MicrosoftVisionResponse {
  language?: string
  regions?: MicrosoftVisionRegion[]
}

export interface MistralOCRPage {
  markdown?: string;
  text?: string;
  index?: number;
  images?: Array<{
    data?: string;
    type?: string;
  }>;
  dimensions?: {
    dpi?: number;
    height?: number;
    width?: number;
  };
}

export interface MistralOCRResponse {
  pages?: MistralOCRPage[];
  text?: string;
  model?: string;
  usage_info?: {
    pages_processed: number;
    doc_size_bytes: number | null;
  };
}