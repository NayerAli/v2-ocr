# Internal File Processing Limits Analysis

## Executive Summary

This report provides a comprehensive analysis of all internal file processing limits implemented in the OCR SaaS application, focusing exclusively on constraints applied before any external API calls. The analysis reveals several inconsistencies in how limits are defined, stored, and applied throughout the codebase, which may explain why certain database configuration changes don't propagate at runtime.

## Key Findings

1. **Multiple Sources of Truth**: Processing limits are defined in multiple locations (constants, default settings, database) with inconsistent values.
2. **Hardcoded vs. Dynamic Limits**: Some limits are hardcoded while others are configurable, creating confusion.
3. **Provider-Specific Limits**: Provider-specific limits (especially for Mistral) are hardcoded and not configurable per user.
4. **Large PDF Handling**: Special handling for large PDFs uses hardcoded thresholds that override user settings.
5. **Inconsistent Units**: File size limits are defined in different units (bytes vs. MB) across the codebase.

## Detailed Analysis

### 1. File Upload Limits

#### Current Implementation

File upload limits are defined in multiple places with inconsistent values:

<augment_code_snippet path="lib/settings-manager.ts" mode="EXCERPT">
````typescript
const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  maxSimultaneousUploads: 5
};
````
</augment_code_snippet>

<augment_code_snippet path="lib/default-settings.ts" mode="EXCERPT">
````typescript
export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxFileSize: 500,
  allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
  maxSimultaneousUploads: 5
}
````
</augment_code_snippet>

<augment_code_snippet path="config/constants.ts" mode="EXCERPT">
````typescript
export const CONFIG = {
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB in bytes
  // ...other constants
}
````
</augment_code_snippet>

**Issue**: The default `maxFileSize` is defined as 10MB in `settings-manager.ts`, 500MB in `default-settings.ts`, and 1GB in `constants.ts`. This inconsistency creates confusion about which limit is actually enforced.

#### Validation Logic

File size validation occurs in multiple places:

<augment_code_snippet path="lib/ocr/queue-manager.ts" mode="EXCERPT">
````typescript
private isFileValid(file: File): boolean {
  if (file.size > this.uploadSettings.maxFileSize * 1024 * 1024) return false;
  return this.uploadSettings.allowedFileTypes.some(type =>
    file.name.toLowerCase().endsWith(type.toLowerCase())
  );
}
````
</augment_code_snippet>

<augment_code_snippet path="app/components/file-upload.tsx" mode="EXCERPT">
````typescript
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop,
  disabled,
  maxSize: maxFileSize * 1024 * 1024,
  accept: {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png']
  },
  // ...other props
})
````
</augment_code_snippet>

**Issue**: While the validation logic correctly uses the user's settings, the inconsistent default values can lead to confusion when a user hasn't explicitly set their preferences.

### 2. Processing Concurrency Limits

#### Current Implementation

Processing concurrency limits are defined in multiple places:

<augment_code_snippet path="lib/default-settings.ts" mode="EXCERPT">
````typescript
export const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 1,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
}
````
</augment_code_snippet>

<augment_code_snippet path="lib/settings-manager.ts" mode="EXCERPT">
````typescript
const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
};
````
</augment_code_snippet>

<augment_code_snippet path="config/constants.ts" mode="EXCERPT">
````typescript
export const CONFIG = {
  // ...other constants
  MAX_CONCURRENT_PROCESSING: 3, // Maximum number of files to process at once
  CHUNK_SIZE: 10, // Number of pages to process at once for large PDFs
  // ...other constants
}
````
</augment_code_snippet>

**Issue**: The default `maxConcurrentJobs` is defined as 1 in `default-settings.ts`, 2 in `settings-manager.ts`, and `MAX_CONCURRENT_PROCESSING` is set to 3 in `constants.ts`. This inconsistency can lead to unexpected behavior.

### 3. PDF Processing Limits

#### Current Implementation

PDF processing has several hardcoded limits that override user settings:

<augment_code_snippet path="lib/ocr/file-processor.ts" mode="EXCERPT">
````typescript
private async processPageByPage(pdf: PDFDocumentProxy, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
  // We don't need supabase here, it's used in processPage
  const numPages = pdf.numPages;
  console.log(`[Process] PDF has ${numPages} pages`);
  const results: OCRResult[] = [];

  // Adjust chunk size based on PDF size and page count
  let pagesPerChunk = this.processingSettings.pagesPerChunk;
  const isLargePDF = numPages > 100;

  // For very large PDFs, reduce the chunk size to avoid memory issues
  if (isLargePDF) {
    // Adjust chunk size based on page count
    if (numPages > 500) {
      pagesPerChunk = Math.min(pagesPerChunk, 5); // Very large PDFs: max 5 pages per chunk
      console.log(`[Process] Very large PDF detected (${numPages} pages). Reducing chunk size to ${pagesPerChunk} pages.`);
    } else if (numPages > 200) {
      pagesPerChunk = Math.min(pagesPerChunk, 8); // Large PDFs: max 8 pages per chunk
      console.log(`[Process] Large PDF detected (${numPages} pages). Reducing chunk size to ${pagesPerChunk} pages.`);
    }
  }
````
</augment_code_snippet>

<augment_code_snippet path="lib/ocr/queue-manager.ts" mode="EXCERPT">
````typescript
// Save results in batches to avoid memory issues with large PDFs
const isLargePDF = item.totalPages && item.totalPages > 100;
const BATCH_SIZE = isLargePDF ? 20 : 50; // Smaller batches for large PDFs
````
</augment_code_snippet>

**Issue**: The code contains hardcoded thresholds (100, 200, 500 pages) for determining if a PDF is "large" and adjusting the processing accordingly. These thresholds override user settings and are not configurable.

### 4. Provider-Specific Limits

#### Current Implementation

Mistral provider has hardcoded limits:

<augment_code_snippet path="lib/ocr/providers/mistral.ts" mode="EXCERPT">
````typescript
export class MistralOCRProvider implements OCRProvider {
  private settings: OCRSettings;
  private rateLimiter: MistralRateLimiter;
  private maxRetries = 3;
  private baseRetryDelay = 2000; // Start with 2 seconds
  private readonly MAX_PDF_SIZE_MB = 50; // 50MB limit for Mistral OCR API
  private readonly MAX_PDF_PAGES = 1000; // 1000 pages limit for Mistral OCR API
  private readonly MAX_REQUEST_SIZE_MB = 10; // Maximum safe request size to avoid buffer issues
  // Flag to control whether to use Mistral's PDF processing or not
  private readonly USE_MISTRAL_PDF_PROCESSING = false; // Set to false to disable Mistral PDF processing
````
</augment_code_snippet>

<augment_code_snippet path="lib/ocr/providers/mistral.ts" mode="EXCERPT">
````typescript
// Check if a PDF file can be processed directly by Mistral OCR API
canProcessPdfDirectly(fileSize: number, pageCount?: number): boolean {
  // If Mistral PDF processing is disabled, always return false
  if (!this.USE_MISTRAL_PDF_PROCESSING) {
    console.log(`[Mistral] PDF processing with Mistral is currently disabled`);
    return false;
  }

  // Check file size limit (50MB)
  const fileSizeMB = fileSize / (1024 * 1024);
  console.log(`[Mistral] Checking if PDF can be processed directly: ${Math.round(fileSizeMB * 100) / 100}MB, ${pageCount || 'unknown'} pages`);

  // Check against Mistral's limits
  if (fileSizeMB > this.MAX_PDF_SIZE_MB) {
    console.log(`[Mistral] PDF exceeds size limit (${Math.round(fileSizeMB * 100) / 100}MB > ${this.MAX_PDF_SIZE_MB}MB)`);
    return false;
  }

  // Check page count limit if known (1000 pages)
  if (pageCount !== undefined && pageCount > this.MAX_PDF_PAGES) {
    console.log(`[Mistral] PDF exceeds page limit (${pageCount} > ${this.MAX_PDF_PAGES})`);
    return false;
  }

  return true;
}
````
</augment_code_snippet>

**Issue**: The Mistral provider has hardcoded limits (`MAX_PDF_SIZE_MB`, `MAX_PDF_PAGES`, `MAX_REQUEST_SIZE_MB`) that are not configurable per user. Additionally, direct PDF processing is disabled by default (`USE_MISTRAL_PDF_PROCESSING = false`), which forces the application to always process PDFs page by page, regardless of their size.

### 5. Rate Limiting Implementation

#### Current Implementation

Rate limiting is implemented for both Microsoft and Mistral providers:

<augment_code_snippet path="lib/ocr/rate-limiter.ts" mode="EXCERPT">
````typescript
export class MistralRateLimiter {
  private isRateLimited: boolean = false;
  private rateLimitEndTime: number = 0;
  private readonly defaultRetryDelay = 60; // Default 60 seconds if no Retry-After header

  constructor() {
    console.log('[Mistral] Rate limiter initialized');
  }

  async waitIfLimited(): Promise<void> {
    if (this.isRateLimited) {
      const waitTime = this.rateLimitEndTime - Date.now();
      if (waitTime > 0) {
        const remainingSeconds = Math.ceil(waitTime/1000);
        console.log(`[Mistral] Rate limited - Waiting ${remainingSeconds}s before resuming`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      console.log('[Mistral] Rate limit period ended - Resuming processing');
      this.isRateLimited = false;
    }
  }
````
</augment_code_snippet>

**Issue**: While the rate limiting implementation is functional, the default retry delay (60 seconds) is hardcoded and not configurable per user. This can lead to inefficient processing if a user has a higher rate limit with their API key.

## Root Causes of Dynamic Limit Inconsistencies

1. **Multiple Default Settings**: The application has multiple default settings defined in different files, leading to confusion about which values are used.

2. **Hardcoded Overrides**: Even when user settings are loaded from the database, hardcoded thresholds in the code can override these settings without clear indication.

3. **Lack of Settings Validation**: When settings are loaded from the database, there's no validation to ensure they're within acceptable ranges, potentially leading to unexpected behavior.

4. **Singleton vs. Instance-Based Services**: Some services are implemented as singletons, while others are instance-based, leading to potential issues with settings propagation.

5. **Caching Without Invalidation**: Settings are cached in various places without proper invalidation mechanisms, causing stale settings to be used even after updates.

## Recommendations

1. **Consolidate Default Settings**: Move all default settings to a single file to avoid inconsistencies.

2. **Make Hardcoded Thresholds Configurable**: Convert hardcoded thresholds (like PDF page limits) into configurable settings.

3. **Implement Settings Validation**: Add validation for settings loaded from the database to ensure they're within acceptable ranges.

4. **Consistent Service Pattern**: Use a consistent pattern (singleton or instance-based) for all services that handle settings.

5. **Proper Cache Invalidation**: Implement proper cache invalidation mechanisms to ensure settings updates are propagated correctly.

6. **Provider-Specific Settings**: Add provider-specific settings to allow users to configure limits for each provider.

7. **Clear Logging**: Improve logging to clearly indicate when settings are loaded, updated, or overridden.

## Conclusion

The analysis reveals several inconsistencies in how internal file processing limits are defined, stored, and applied throughout the codebase. These inconsistencies can lead to unexpected behavior, especially when users attempt to update their settings through the database. By addressing the recommendations above, the application can provide a more consistent and predictable experience for users.
