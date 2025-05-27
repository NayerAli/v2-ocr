// We need OCRSettings for the provider implementations
import type { OCRResult } from "@/types";

export interface OCRProvider {
  processImage(base64Data: string, signal: AbortSignal, fileType?: string, pageNumber?: number, totalPages?: number): Promise<OCRResult>;
  canProcessPdfDirectly?(fileSize: number, pageCount?: number): boolean;
  processPdfDirectly?(pdfBase64: string, signal: AbortSignal): Promise<OCRResult>;
}

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