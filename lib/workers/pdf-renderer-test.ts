/*
  Test utility to verify PDF Worker functionality in background tabs.
  This can be used in browser console to test the worker implementation.
*/

import { pdfRenderer } from './pdf-renderer-client';

export interface WorkerTestResult {
  success: boolean;
  error?: string;
  processingTime: number;
  backgroundTest: boolean;
  workerUsed: boolean;
}

/**
 * Test the PDF worker with a sample PDF to verify it works in background tabs
 */
export async function testPdfWorkerInBackground(): Promise<WorkerTestResult> {
  const startTime = Date.now();
  
  try {
    // Check if worker is available
    if (!pdfRenderer) {
      return {
        success: false,
        error: 'PDF renderer not available (likely server-side)',
        processingTime: Date.now() - startTime,
        backgroundTest: false,
        workerUsed: false
      };
    }

    // Create a minimal PDF for testing (this is a valid but empty PDF)
    const minimalPdfBase64 = 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Cj4+Cj4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwKL1NpemUgNAovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMjI5CiUlRU9G';
    const pdfArrayBuffer = Uint8Array.from(atob(minimalPdfBase64), c => c.charCodeAt(0)).buffer;

    console.log('[Worker Test] Starting PDF worker test...');
    console.log('[Worker Test] Document visibility:', document.hidden ? 'hidden' : 'visible');

    // Test rendering page 1
    const base64Result = await pdfRenderer.renderPageToBase64(pdfArrayBuffer, 1, 1.0);

    if (!base64Result || base64Result.length === 0) {
      return {
        success: false,
        error: 'Worker returned empty result',
        processingTime: Date.now() - startTime,
        backgroundTest: document.hidden,
        workerUsed: true
      };
    }

    console.log('[Worker Test] Successfully rendered page, base64 length:', base64Result.length);

    return {
      success: true,
      processingTime: Date.now() - startTime,
      backgroundTest: document.hidden,
      workerUsed: true
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
      backgroundTest: document.hidden,
      workerUsed: true
    };
  }
}

/**
 * Run a continuous background test that logs results every few seconds
 */
export function startContinuousBackgroundTest(intervalMs = 5000): () => void {
  let testCount = 0;
  
  const interval = setInterval(async () => {
    testCount++;
    console.log(`[Background Test ${testCount}] Starting test...`);
    
    const result = await testPdfWorkerInBackground();
    
    console.log(`[Background Test ${testCount}] Result:`, {
      success: result.success,
      time: `${result.processingTime}ms`,
      background: result.backgroundTest,
      error: result.error
    });
    
    if (!result.success) {
      console.error(`[Background Test ${testCount}] FAILED:`, result.error);
    }
  }, intervalMs);
  
  console.log('[Background Test] Started continuous testing. Call the returned function to stop.');
  
  return () => {
    clearInterval(interval);
    console.log('[Background Test] Stopped continuous testing.');
  };
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).testPdfWorkerInBackground = testPdfWorkerInBackground;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).startContinuousBackgroundTest = startContinuousBackgroundTest;
  
  console.log('[Worker Test] Test functions available globally:');
  console.log('- testPdfWorkerInBackground(): Test worker once');
  console.log('- startContinuousBackgroundTest(): Start continuous testing');
}