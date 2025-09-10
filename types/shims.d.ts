// Minimal ambient module shims to satisfy TypeScript during lint/build without native deps
declare module 'canvas' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createCanvas(width: number, height: number): any
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const GlobalWorkerOptions: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getDocument(data: any): { promise: Promise<any> }
}

declare module 'next/server' {
  export const NextResponse: any
}

// Minimal global Buffer type to satisfy TypeScript when @types/node isn't available in host
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const Buffer: {
  isBuffer(input: unknown): input is unknown
  from(data: ArrayBuffer | Uint8Array | string, encoding?: string): unknown
}

