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
  private worker: Worker | null = null;
  private readonly pending = new Map<string, { resolve: (b64: string) => void; reject: (err: Error) => void }>();

  constructor() {
    // Ensure we are in a browser context
    if (typeof window === 'undefined') {
      throw new Error('PdfRendererWorkerClient can only be used in the browser');
    }

    console.log('[PDF Worker Client] Creating dedicated worker …')
    try {
      this.worker = new Worker(new URL('./pdf-renderer.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      console.error('[PDF Worker Client] Failed to instantiate PDF renderer worker:', err);
      this.worker = null; // force fallback to in-thread rendering
      return;
    }

    // Heart-beat monitoring – verify worker remains responsive when tab is hidden.
    let lastPong = Date.now();
    const pingInterval = 10_000;
    const monitor = () => {
      if (Date.now() - lastPong > pingInterval * 2) {
        console.warn('[PDF Worker] heartbeat lost – recreating worker');
        this.recreateWorker();
      }
      this.worker?.postMessage({ type: 'ping' });
    };
    const timer = setInterval(monitor, pingInterval);

    this.worker.onmessage = (e: MessageEvent) => {
      // Heart-beat pong
      if (e.data && e.data.type === 'pong') {
        lastPong = Date.now();
        return;
      }

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

    // Cleanup when page unloads
    window.addEventListener('pagehide', () => {
      clearInterval(timer);
      this.worker?.terminate();
    });

    console.log('[PDF Worker Client] Worker created and heart-beat started');
  }

  private recreateWorker() {
    this.worker?.terminate();
    // Reject all pending promises
    this.pending.forEach(({ reject }) => reject(new Error('Worker restarted')));
    this.pending.clear();

    // Recreate worker (inline fallback not needed inside method)
    try {
      this.worker = new Worker(new URL('./pdf-renderer.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      const blob = new Blob([this.inlineWorkerScript], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    }
  }

  renderPageToBase64(
    pdfData: ArrayBuffer,
    pageNumber: number,
    scale = 1.5
  ): Promise<string> {
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.postMessage({ id, pdfData, pageNumber, scale });
    });
  }
}

export const pdfRenderer: PdfRenderer | null =
  typeof window !== 'undefined' ? new PdfRendererWorkerClient() : null;