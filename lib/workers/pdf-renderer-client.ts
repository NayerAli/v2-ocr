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

    // Use a simpler approach for Next.js compatibility
    const workerScript = `
      import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/+esm';
      
      // Configure PDF.js worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.js';
      
      self.onmessage = async (event) => {
        const { id, pdfData, pageNumber, scale = 1.5 } = event.data;
        
        try {
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
          
          if (pageNumber < 1 || pageNumber > pdf.numPages) {
            throw new Error(\`Invalid page number \${pageNumber}. Document has \${pdf.numPages} pages.\`);
          }
          
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const canvas = new OffscreenCanvas(viewport.width, viewport.height);
          const context = canvas.getContext('2d');
          
          if (!context) throw new Error('Failed to obtain OffscreenCanvas 2D context');
          
          await page.render({ canvasContext: context, viewport }).promise;
          
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
          const reader = new FileReader();
          
          reader.onloadend = () => {
            const dataUrl = reader.result;
            const base64 = dataUrl.split(',')[1];
            self.postMessage({ id, base64 });
          };
          
          reader.onerror = () => {
            self.postMessage({ id, error: 'Failed to convert blob to base64' });
          };
          
          reader.readAsDataURL(blob);
        } catch (error) {
          self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob), { type: 'module' });

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