/*
  Dedicated Web Worker for rendering PDF pages to base64 JPEG.
  Uses the local pdfjs-dist bundle bundled by Next.js (no remote fetch).
*/

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

// Ensure PDF.js does not try to spin its own worker
// (we are already inside a dedicated worker)
// Prevent external worker script fetches as well
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjsLib as any).disableWorker = true;
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const ctx = self as unknown as DedicatedWorkerGlobalScope

interface RenderRequest {
  id: string
  pdfData: ArrayBuffer
  pageNumber: number
  scale?: number
}

type WorkerMessage =
  | ({ type: 'render' } & RenderRequest)
  | { type: 'ping' }

type WorkerResponse =
  | { id: string; base64: string }
  | { id: string; error: string }
  | { type: 'pong' }

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  if (msg.type === 'ping') {
    // Heart-beat pong
    ctx.postMessage({ type: 'pong' } as WorkerResponse)
    return
  }

  console.log('[PDF Worker] Render request received', { page: msg.pageNumber })

  const { id, pdfData, pageNumber, scale = 1.5 } = msg
  try {
    const pdf = await pdfjsLib.getDocument({ data: pdfData, disableWorker: true }).promise
    console.log('[PDF Worker] PDF loaded. pages:', pdf.numPages)
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Invalid page number ${pageNumber}. Document has ${pdf.numPages} pages.`)
    }

    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
    if (!context) throw new Error('Failed to obtain OffscreenCanvas context')

    await page.render({ canvasContext: context, viewport }).promise
    console.log('[PDF Worker] Page rendered:', pageNumber)

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      ctx.postMessage({ id, base64 } as WorkerResponse)
    }
    reader.onerror = () => {
      ctx.postMessage({ id, error: 'Failed to convert blob to base64' } as WorkerResponse)
    }
    reader.readAsDataURL(blob)
  } catch (err) {
    console.error('[PDF Worker] Error while rendering page', pageNumber, err)
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) } as WorkerResponse)
  }
}