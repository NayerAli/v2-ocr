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

import { createCanvas, Image, Canvas } from '@napi-rs/canvas'
// Use legacy build for Node.js environments to avoid runtime warnings
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import path from 'path'
import fs from 'fs'

let canvasInitialized = false
let pdfJsInitialized = false

function initializeCanvas() {
  if (canvasInitialized) return
  try {
    console.log('[PDF-to-Images] Initializing Canvas...')
    const testCanvas = createCanvas(1, 1)
    const testCtx = testCanvas.getContext('2d')
    if (!testCtx) {
      throw new Error('Canvas 2D context unavailable')
    }

    canvasInitialized = true
    console.log('[PDF-to-Images] Canvas initialized successfully')
  } catch (error) {
    console.error('[PDF-to-Images] Canvas initialization failed:', error)
    throw new Error(`Canvas initialization failed: ${String(error)}`)
  }
}

// Local polyfills that don't interfere with Next.js global scope
function setupLocalPolyfills() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localGlobal = {} as any

  // Create simple polyfills that work with PDF.js
  localGlobal.HTMLImageElement = Image
  localGlobal.HTMLCanvasElement = Canvas
  localGlobal.Image = Image
  localGlobal.Canvas = Canvas

  // CanvasRenderingContext2D polyfill
  const testCanvas = createCanvas(1, 1)
  const testCtx = testCanvas.getContext('2d')
  localGlobal.CanvasRenderingContext2D = testCtx?.constructor

  // Document polyfill for PDF.js with enhanced createElement
  localGlobal.document = {
    createElement: (tagName: string) => {
      if (tagName === 'canvas') {
        return new Canvas(300, 150)
      }
      if (tagName === 'img') {
        return new Image()
      }
      // Return a minimal element-like object for other tags
      return {
        tagName: tagName.toUpperCase(),
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        removeChild: () => {}
      }
    },
    body: {
      appendChild: () => {},
      removeChild: () => {}
    },
    head: {
      appendChild: () => {},
      removeChild: () => {}
    }
  }

  // Window polyfill for PDF.js with enhanced properties
  localGlobal.window = {
    document: localGlobal.document,
    Image: localGlobal.HTMLImageElement,
    HTMLImageElement: localGlobal.HTMLImageElement,
    HTMLCanvasElement: localGlobal.HTMLCanvasElement,
    Canvas: localGlobal.HTMLCanvasElement,
    CanvasRenderingContext2D: localGlobal.CanvasRenderingContext2D,
    devicePixelRatio: 1,
    location: { href: 'http://localhost' },
    navigator: { userAgent: 'Node.js' },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      return setTimeout(callback, 16) // ~60fps
    },
    cancelAnimationFrame: (id: number) => {
      clearTimeout(id)
    }
  }

  // Additional polyfills for PDF.js compatibility
  localGlobal.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64')
  localGlobal.atob = (str: string) => Buffer.from(str, 'base64').toString('binary')

  // URL polyfill for PDF.js
  localGlobal.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  }

  // Blob polyfill for PDF.js
  localGlobal.Blob = class MockBlob {
    constructor(parts: (string | ArrayBuffer | ArrayBufferView)[], options?: { type?: string }) {
      this.size = 0
      this.type = options?.type || ''
    }
    size: number
    type: string
  }

  return localGlobal
}

function applyPolyfills(polyfills: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalAny = globalThis as any
  const originalValues: Record<string, unknown> = {}

  // Store original values and apply polyfills
  for (const [key, value] of Object.entries(polyfills)) {
    originalValues[key] = globalAny[key]
    globalAny[key] = value
  }

  return originalValues
}

function restoreGlobals(originalValues: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalAny = globalThis as any

  // Restore original values
  for (const [key, value] of Object.entries(originalValues)) {
    if (value === undefined) {
      delete globalAny[key]
    } else {
      globalAny[key] = value
    }
  }
}

function initializePdfJs() {
  if (pdfJsInitialized) return

  try {
    console.log('[PDF-to-Images] Initializing PDF.js...')

    // Try multiple worker paths to ensure compatibility
    const workerPaths = [
      path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
      path.join(process.cwd(), '.next', 'standalone', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
      'pdfjs-dist/legacy/build/pdf.worker.mjs'
    ]

    let workerFound = false
    for (const workerPath of workerPaths) {
      try {
        if (fs.existsSync(workerPath)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerPath
          console.log('[PDF-to-Images] Using worker path:', workerPath)
          workerFound = true
          break
        }
      } catch {
        // Continue to next path
      }
    }

    if (!workerFound) {
      console.warn('[PDF-to-Images] No worker file found, using default path')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
    }

    pdfJsInitialized = true
    console.log('[PDF-to-Images] PDF.js initialized successfully')
  } catch (error) {
    console.error('[PDF-to-Images] PDF.js initialization failed:', error)
    throw new Error(`PDF.js initialization failed: ${String(error)}`)
  }
}

export async function convertPdfToJpegs(
  pdfInput: Buffer | Uint8Array | ArrayBuffer,
  options?: { scale?: number; quality?: number }
) {
  console.log('[PDF-to-Images] Starting PDF conversion...')

  // Ensure canvas/image environment is ready in Node before using pdf.js
  initializeCanvas()
  initializePdfJs()

  // Set up local polyfills for PDF.js without affecting Next.js global scope
  const polyfills = setupLocalPolyfills()
  const originalGlobals = applyPolyfills(polyfills)

  const scale = options?.scale ?? 1.5
  const quality = options?.quality ?? 0.8

  console.log('[PDF-to-Images] Using scale:', scale, 'quality:', quality)

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

  console.log('[PDF-to-Images] PDF data size:', pdfData.length, 'bytes')

  // Try multiple font paths for better compatibility
  const fontPaths = [
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
    path.join(process.cwd(), '.next', 'standalone', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
  ]

  let standardFontDataUrl = fontPaths[0]
  for (const fontPath of fontPaths) {
    try {
      if (fs.existsSync(fontPath.slice(0, -1))) { // Remove trailing slash for existence check
        standardFontDataUrl = fontPath
        console.log('[PDF-to-Images] Using font path:', fontPath)
        break
      }
    } catch {
      // Continue to next path
    }
  }

  try {
    console.log('[PDF-to-Images] Loading PDF document...')
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      standardFontDataUrl,
      // Additional options for better compatibility
      disableRange: false,
      disableStream: false,
      disableAutoFetch: false,
      // Ensure text rendering works properly
      useSystemFonts: true,
      // Enable CMap for better text extraction
      cMapUrl: path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'cmaps') + '/',
      cMapPacked: true
    })

    const pdf = await loadingTask.promise
    console.log('[PDF-to-Images] PDF loaded successfully, pages:', pdf.numPages)

    const pages: { pageNumber: number; base64: string }[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`[PDF-to-Images] Processing page ${i}/${pdf.numPages}...`)

      try {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale })

        console.log(`[PDF-to-Images] Page ${i} viewport:`, {
          width: viewport.width,
          height: viewport.height,
          scale: viewport.scale
        })

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          throw new Error(`Failed to get canvas context for page ${i}`)
        }

        // Set white background to avoid transparent/black backgrounds
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        console.log(`[PDF-to-Images] Rendering page ${i}...`)

        // Render to node-canvas - use unknown then cast to satisfy both type systems
        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          // Additional rendering options
          intent: 'display'
        }).promise

        console.log(`[PDF-to-Images] Page ${i} rendered successfully`)

        const buf: Buffer = canvas.toBuffer('image/jpeg', quality)
        const base64 = buf.toString('base64')

        // Verify the image is not empty (basic check)
        if (base64.length < 100) {
          console.warn(`[PDF-to-Images] Warning: Page ${i} generated very small image (${base64.length} chars)`)
        } else {
          console.log(`[PDF-to-Images] Page ${i} converted to base64 (${base64.length} chars)`)
        }

        pages.push({ pageNumber: i, base64 })
      } catch (pageError) {
        console.error(`[PDF-to-Images] Error processing page ${i}:`, pageError)
        throw new Error(`Failed to process page ${i}: ${String(pageError)}`)
      }
    }

    console.log('[PDF-to-Images] PDF conversion completed successfully')
    return pages
  } catch (error) {
    console.error('[PDF-to-Images] PDF conversion failed:', error)
    throw new Error(`PDF conversion failed: ${String(error)}`)
  } finally {
    // Always restore global state to avoid interfering with Next.js
    restoreGlobals(originalGlobals)
    console.log('[PDF-to-Images] Global polyfills cleaned up')
  }
}
