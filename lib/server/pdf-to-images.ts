// Server-side PDF -> JPEG conversion using pdfjs-dist and node-canvas
// This module is server-only
if (typeof window !== 'undefined') {
  throw new Error('pdf-to-images must run on the server');
}

// Polyfill for Promise.withResolvers in Node versions that don't support it yet (runtime-only, no TS augment)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _PromiseAny = Promise as any
if (typeof _PromiseAny.withResolvers !== 'function') {
  _PromiseAny.withResolvers = function<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
}

import { createCanvas } from 'canvas'
// Use legacy build for Node.js environments to avoid runtime warnings
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// For server-side, we don't need to configure the worker path
// Node.js can handle it automatically

export async function convertPdfToJpegs(
  pdfInput: ArrayBuffer | Uint8Array | ArrayBufferLike | unknown,
  options?: { scale?: number; quality?: number }
) {
  const scale = options?.scale ?? 1.5
  const quality = options?.quality ?? 0.8

  // Ensure worker is properly set for Node/SSR. This avoids dynamic resolution failures.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  } catch {}

  // Ensure pdf.js receives a Uint8Array, not a Node Buffer
  let pdfData: Uint8Array
  if (typeof Buffer !== 'undefined' && (Buffer as unknown as { isBuffer?: (i: unknown) => boolean }).isBuffer?.(pdfInput)) {
    const buf = pdfInput as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
    pdfData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  } else if (pdfInput instanceof Uint8Array) {
    pdfData = pdfInput
  } else if (typeof ArrayBuffer !== 'undefined' && pdfInput instanceof ArrayBuffer) {
    pdfData = new Uint8Array(pdfInput)
  } else if (pdfInput && typeof pdfInput === 'object') {
    // Fallback for any ArrayBufferLike
    pdfData = new Uint8Array(pdfInput as ArrayBufferLike)
  } else {
    throw new Error('Unsupported PDF input type')
  }

  const loadingTask = pdfjsLib.getDocument({ data: pdfData })
  const pdf = await loadingTask.promise

  const pages: { pageNumber: number; base64: string }[] = []

  // Provide a Node-capable CanvasFactory so pdf.js never tries to use DOM canvas internally
  const nodeCanvasFactory = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(width: number, height: number): { canvas: any; context: CanvasRenderingContext2D } {
      const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)))
      const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
      return { canvas, context }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reset(target: { canvas: any; context: CanvasRenderingContext2D }, width: number, height: number) {
      target.canvas.width = Math.max(1, Math.ceil(width))
      target.canvas.height = Math.max(1, Math.ceil(height))
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    destroy(target: { canvas: any; context: CanvasRenderingContext2D }) {
      // Release references to help GC
      target.canvas.width = 0
      target.canvas.height = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(target as any).canvas = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(target as any).context = null
    },
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    // Allocate a rendering surface via the factory
    const surface = nodeCanvasFactory.create(viewport.width, viewport.height)

    // Render to node-canvas with an explicit canvasFactory so all internals use node-canvas
    await page.render({
      canvasContext: surface.context as unknown as CanvasRenderingContext2D,
      viewport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvasFactory: nodeCanvasFactory as unknown as any,
    }).promise

    // Convert to JPEG
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = (surface.canvas as any).toBuffer('image/jpeg', { quality }) as unknown as { toString: (enc: 'base64') => string }
    const base64 = buf.toString('base64')
    pages.push({ pageNumber: i, base64 })

    nodeCanvasFactory.destroy(surface)
  }

  return pages
}
