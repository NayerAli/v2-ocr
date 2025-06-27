/*
  Minimal TypeScript declarations for the `pdfjs-dist` ESM bundle.
  Only the symbols we actually consume inside the codebase are typed.
  If you need richer typings, install `@types/pdfjs-dist` or replace this file.
*/

declare module "pdfjs-dist" {
  export const version: string;

  /**
   * Configure the worker script used by PDF.js in the browser.
   */
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  /** A single page inside a loaded PDF document. */
  export interface PDFPageProxy {
    getViewport(params: { scale: number }): { width: number; height: number };

    render(params: {
      canvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }): { promise: Promise<void> };

    /**
     * Free the objects allocated during rendering.
     */
    cleanup(): void;
  }

  /** Handle returned by `getDocument()` representing an entire PDF. */
  export interface PDFDocumentProxy {
    /** Number of pages contained in the document. */
    numPages: number;

    /** Retrieve a specific page (1-based). */
    getPage(pageNumber: number): Promise<PDFPageProxy>;

    /** Release all resources associated with the document. */
    destroy(): Promise<void> | void;
  }

  /**
   * Load a PDF either from a URL or from raw data.
   * The real PDF.js API supports many options; we model only what we use
   * throughout the project.
   */
  export function getDocument(options: {
    data: ArrayBuffer | Uint8Array | number[] | string;
    disableRange?: boolean;
    disableStream?: boolean;
    disableAutoFetch?: boolean;
    isEvalSupported?: boolean;
  }): { promise: Promise<PDFDocumentProxy> };
}

declare module "pdfjs-dist/legacy/build/pdf" {
  export * from "pdfjs-dist";
}