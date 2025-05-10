/**
 * Utility functions for file handling that work in both browser and server environments
 */

import { infoLog } from '@/lib/log';

/**
 * Convert a file or blob to base64 in a way that works in both browser and server environments
 */
export async function fileToBase64(file: File | Blob | Buffer): Promise<string> {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && typeof FileReader !== 'undefined') {
    // Browser environment - use FileReader
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // If the result is a data URL, extract the base64 part
        if (result.includes('base64,')) {
          resolve(result.split('base64,')[1]);
        } else {
          resolve(result);
        }
      };
      reader.onerror = (error) => reject(new Error(`Failed to read file: ${error}`));
      reader.readAsDataURL(file);
    });
  } else {
    // Server environment - use Buffer
    try {
      infoLog('[FileUtils] Using server-side method to convert file to base64');
      
      // If file is a Buffer
      if (Buffer.isBuffer(file)) {
        return file.toString('base64');
      }
      
      // If file is a File object with arrayBuffer method (Node.js v14+)
      if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
        const buffer = await file.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
      }
      
      // If file has a stream method (Node.js File API)
      if ('stream' in file && typeof file.stream === 'function') {
        infoLog('[FileUtils] Using stream method to convert file to base64');
        
        const chunks: Uint8Array[] = [];
        const stream = file.stream();
        const reader = stream.getReader();
        
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            chunks.push(value);
          }
        }
        
        const buffer = Buffer.concat(chunks);
        return buffer.toString('base64');
      }
      
      // If file is a Blob with arrayBuffer method
      if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
        const buffer = await file.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
      }
      
      // If file has a buffer property
      if ('buffer' in file && Buffer.isBuffer(file.buffer)) {
        return Buffer.from(file.buffer).toString('base64');
      }
      
      throw new Error('Unsupported file type for server-side base64 conversion');
    } catch (error) {
      infoLog('[FileUtils] Error converting file to base64:', error);
      throw error;
    }
  }
}

/**
 * Convert base64 to a Blob in a way that works in both browser and server environments
 */
export async function base64ToBlob(base64: string, contentType: string = ''): Promise<Blob> {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Browser environment - use fetch
    return fetch(`data:${contentType};base64,${base64}`).then(res => res.blob());
  } else {
    // Server environment - use Buffer
    try {
      infoLog('[FileUtils] Using server-side method to convert base64 to blob');
      
      const buffer = Buffer.from(base64, 'base64');
      
      // Create a Blob-like object that works in Node.js
      return new Blob([buffer], { type: contentType });
    } catch (error) {
      infoLog('[FileUtils] Error converting base64 to blob:', error);
      throw error;
    }
  }
}

/**
 * Check if a file is a valid image
 */
export function isValidImage(file: File | Blob): boolean {
  const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return validImageTypes.includes(file.type);
}

/**
 * Check if a file is a valid PDF
 */
export function isValidPDF(file: File | Blob): boolean {
  return file.type === 'application/pdf';
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}
