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

import { createCanvas, Image } from 'canvas'
// Use legacy build for Node.js environments to avoid runtime warnings
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import path from 'path'

// For server-side, we don't need to configure the worker path
// Node.js can handle it automatically

let canvasInitialized = false

function initializeCanvas() {
  if (canvasInitialized) return
  try {
    const testCanvas = createCanvas(1, 1)
    const testCtx = testCanvas.getContext('2d')
    if (!testCtx) {
      throw new Error('Canvas 2D context unavailable')
    }
    // Ensure pdfjs uses the Canvas Image implementation after successful probe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).Image = Image
    canvasInitialized = true
  } catch (error) {
    throw new Error(`Canvas initialization failed: ${String(error)}`)
  }
}

export async function convertPdfToJpegs(
  pdfInput: Buffer | Uint8Array | ArrayBuffer,
  options?: { scale?: number; quality?: number }
) {
  // Ensure canvas/image environment is ready in Node before using pdf.js
  initializeCanvas()

  const scale = options?.scale ?? 1.5
  const quality = options?.quality ?? 0.8

  // Ensure worker is properly set for Node/SSR. This avoids dynamic resolution failures.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  } catch {}

  // Ensure pdf.js receives a Uint8Array, not a Node Buffer
  let pdfData: Uint8Array
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(pdfInput)) {
    pdfData = new Uint8Array(pdfInput.buffer, pdfInput.byteOffset, pdfInput.byteLength)
  } else if (pdfInput instanceof Uint8Array) {
    pdfData = pdfInput
  } else if (typeof ArrayBuffer !== 'undefined' && pdfInput instanceof ArrayBuffer) {
    pdfData = new Uint8Array(pdfInput)
  } else {
    // Fallback for any ArrayBufferLike
    pdfData = new Uint8Array(pdfInput as ArrayBufferLike)
  }

  const standardFontDataUrl =
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
  const loadingTask = pdfjsLib.getDocument({ data: pdfData, standardFontDataUrl })
  const pdf = await loadingTask.promise

  const pages: { pageNumber: number; base64: string }[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')

    // Render to node-canvas - use unknown then cast to satisfy both type systems
    await page.render({ 
      canvasContext: ctx as unknown as CanvasRenderingContext2D, 
      viewport 
    }).promise

    const buf: Buffer = canvas.toBuffer('image/jpeg', { quality })
    const base64 = buf.toString('base64')
    pages.push({ pageNumber: i, base64 })
  }

  return pages
}
