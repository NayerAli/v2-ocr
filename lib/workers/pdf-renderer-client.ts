/*
  Client wrapper around the PDF renderer Web Worker. Provides a simple
  Promise-based API to render a page to base64.
*/

export interface PdfRenderer {
  renderPageToBase64: (
    pdfData: ArrayBuffer,
    pageNumber: number,
    scale?: number
  ) => Promise<string>;
}

class PdfRendererWorkerClient implements PdfRenderer {
  private readonly worker: Worker;
  private readonly pending = new Map<string, { resolve: (b64: string) => void; reject: (err: Error) => void }>();

  constructor() {
    // Ensure we are in a browser context
    if (typeof window === 'undefined') {
      throw new Error('PdfRendererWorkerClient can only be used in the browser');
    }

    this.worker = new Worker(new URL('./pdf-renderer.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, base64, error } = e.data as {
        id: string;
        base64?: string;
        error?: string;
      };
      const entry = this.pending.get(id);
      if (!entry) return;

      if (base64) {
        entry.resolve(base64);
      } else {
        entry.reject(new Error(error || 'Unknown worker error'));
      }
      this.pending.delete(id);
    };

    this.worker.onerror = (e) => {
      console.error('[PDF Worker] Error:', e.message);
    };
  }

  renderPageToBase64(
    pdfData: ArrayBuffer,
    pageNumber: number,
    scale = 1.5
  ): Promise<string> {
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, pdfData, pageNumber, scale });
    });
  }
}

export const pdfRenderer: PdfRenderer | null =
  typeof window !== 'undefined' ? new PdfRendererWorkerClient() : null;