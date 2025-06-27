/*
  Web Worker: PDF Renderer
  Purpose: Offload PDF.js page rendering and JPEG encoding to a separate
  thread to keep the UI responsive. The worker expects messages with the
  following shape:
    {
      id: string;            // unique request id
      pdfData: ArrayBuffer;  // entire PDF file
      pageNumber: number;    // page to render (1-based)
      scale?: number;        // render scale (default 1.5)
    }

  It responds with either:
    { id, base64: string }        on success
    { id, error: string }         on failure
*/

import * as pdfjsLib from 'pdfjs-dist';

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent) => {
  const { id, pdfData, pageNumber, scale = 1.5 } = event.data as {
    id: string;
    pdfData: ArrayBuffer;
    pageNumber: number;
    scale?: number;
  };

  try {
    // Load the PDF document
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

    // Validate page number
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Invalid page number ${pageNumber}. Document has ${pdf.numPages} pages.`);
    }

    const page = await pdf.getPage(pageNumber);

    const viewport = page.getViewport({ scale });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to obtain OffscreenCanvas 2D context');

    await page.render({ canvasContext: context, viewport }).promise;

    // Encode canvas to JPEG
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    const base64 = await blobToBase64(blob);

    ctx.postMessage({ id, base64 });
  } catch (error) {
    ctx.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

// Convert Blob to base64 string (without data prefix)
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
}