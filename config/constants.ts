/**
 * Storage configuration
 */
export const BUCKET_NAME = 'ocr-documents';
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp'
] as const;

/**
 * Database configuration
 */
export const DB_SCHEMA_VERSION = 1;
export const DB_CACHE_TTL = 5000; // 5 seconds
export const DB_MAX_RETRY_ATTEMPTS = 3;
export const DB_RETRY_DELAY = 2000; // 2 seconds

/**
 * API configuration
 */
export const API_CACHE_CONTROL = {
  PRIVATE_SHORT: 'private, max-age=5',
  NO_STORE: 'no-cache, no-store, must-revalidate'
} as const;

/**
 * PDF processing configuration
 */
export const PDF_VERSION = '3.11.174';
export const PREVIEW_MAX_SIZE = 5 * 1024 * 1024; // 5MB
export const CHUNK_SIZE = 5; // Number of pages to process at once

/**
 * Supported languages and APIs
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'ar', name: 'العربية', direction: 'rtl' },
  { code: 'fa', name: 'فارسی', direction: 'rtl' }
] as const;

export const SUPPORTED_APIS = ['google', 'microsoft', 'mistral'] as const;

/**
 * Export all configuration as a single object
 */
export const CONFIG = {
  BUCKET_NAME,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  DB_SCHEMA_VERSION,
  DB_CACHE_TTL,
  DB_MAX_RETRY_ATTEMPTS,
  DB_RETRY_DELAY,
  API_CACHE_CONTROL,
  PDF_VERSION,
  PREVIEW_MAX_SIZE,
  CHUNK_SIZE,
  SUPPORTED_LANGUAGES,
  SUPPORTED_APIS
} as const;

