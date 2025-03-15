import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * Initialize PDF.js for server-side usage
 */
export async function initializePDFJS() {
  try {
    console.log('[PDF.js] Starting initialization...');
    
    // Disable worker in Node.js environment
    GlobalWorkerOptions.workerSrc = '';
    
    // Set up a fake worker handler for Node.js
    (global as any).pdfjsWorker = {
      WorkerMessageHandler: {
        setup: (handler: any) => {
          console.log('[PDF.js] Setting up fake worker handler');
          return handler;
        }
      }
    };

    return {
      isOffscreenCanvasSupported: false,
      isWebGLEnabled: false,
      disableFontFace: true,
      useSystemFonts: true,
      disableWorker: true,
      standardFontDataUrl: 'standard_fonts/'
    };
  } catch (error) {
    console.error('[PDF.js] Initialization error:', error);
    throw error;
  }
}

