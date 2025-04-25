# Corrections for Building Errors - 25-05-2024

This document summarizes all the fixes applied to resolve npm build and ESLint errors in the project.

## 1. Fixed unused imports and variables in `app/api/documents/[id]/route.ts`

### Fix 1.1: Removed unused imports
*Original Code*   
```ts 
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/database"
import { debugLog } from "@/lib/log"
import { logApiRequestToConsole } from "@/lib/server-console-logger"
import { createServerSupabaseClient } from "@/lib/server-auth"
```
*Corrected Code*   
```ts
import { NextRequest, NextResponse } from "next/server"
import { logApiRequestToConsole } from "@/lib/server-console-logger"
import { createServerSupabaseClient } from "@/lib/server-auth"
```

### Fix 1.2: Removed unused `mappedDocument` variable
*Original Code*   
```ts
    // Map the document to the expected format
    const mappedDocument = {
      id: existingDocument.id,
      filename: existingDocument.filename,
      originalFilename: existingDocument.original_filename,
      status: existingDocument.status,
      progress: existingDocument.progress,
      currentPage: existingDocument.current_page,
      totalPages: existingDocument.total_pages,
      fileSize: existingDocument.file_size,
      fileType: existingDocument.file_type,
      storagePath: existingDocument.storage_path,
      thumbnailPath: existingDocument.thumbnail_path,
      error: existingDocument.error,
      createdAt: existingDocument.created_at,
      updatedAt: existingDocument.updated_at,
      processingStartedAt: existingDocument.processing_started_at,
      processingCompletedAt: existingDocument.processing_completed_at,
      user_id: existingDocument.user_id
    }
```
*Corrected Code*   
```ts
    // Document exists and belongs to the user
```

## 2. Fixed React hooks issue in `app/documents/[id]/page.tsx`

### Fix 2.1: Added useCallback to refreshSignedUrl function
*Original Code*   
```ts
  // Function to refresh a signed URL using the storage path
  const refreshSignedUrl = async (result: OCRResult | undefined): Promise<string | undefined> => {
    if (!result || !result.storagePath) return undefined;

    try {
      // Import the Supabase client
      const { supabase } = await import('@/lib/database/utils');

      // Create a signed URL that expires in 24 hours (86400 seconds)
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .createSignedUrl(result.storagePath, 86400);

      if (error || !data?.signedUrl) {
        console.error('Error generating signed URL:', error);
        return undefined;
      }

      // Update the result in our local state
      setResults(prev => prev.map(r => {
        if (r.id === result.id) {
          return { ...r, imageUrl: data.signedUrl };
        }
        return r;
      }));

      return data.signedUrl;
    } catch (error) {
      console.error('Error refreshing signed URL:', error);
      return undefined;
    }
  };
```
*Corrected Code*   
```ts
  // Function to refresh a signed URL using the storage path
  const refreshSignedUrl = useCallback(async (result: OCRResult | undefined): Promise<string | undefined> => {
    if (!result || !result.storagePath) return undefined;

    try {
      // Import the Supabase client
      const { supabase } = await import('@/lib/database/utils');

      // Create a signed URL that expires in 24 hours (86400 seconds)
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .createSignedUrl(result.storagePath, 86400);

      if (error || !data?.signedUrl) {
        console.error('Error generating signed URL:', error);
        return undefined;
      }

      // Update the result in our local state
      setResults(prev => prev.map(r => {
        if (r.id === result.id) {
          return { ...r, imageUrl: data.signedUrl };
        }
        return r;
      }));

      return data.signedUrl;
    } catch (error) {
      console.error('Error refreshing signed URL:', error);
      return undefined;
    }
  }, []);
```

## 3. Fixed `any` type in `app/page.tsx`

### Fix 3.1: Created proper type for processingServiceRef
*Original Code*   
```ts
  // Reference to hold the processing service
  const processingServiceRef = useRef<any>(null)
```
*Corrected Code*   
```ts
  // Reference to hold the processing service
  interface ProcessingService {
    addToQueue: (files: File[]) => Promise<string[]>;
    getStatus: (id: string) => Promise<ProcessingStatus | undefined>;
    cancelProcessing: (id: string) => Promise<void>;
    pauseQueue: () => Promise<void>;
    resumeQueue: () => Promise<void>;
    updateSettings: (settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }) => Promise<void>;
    retryDocument: (id: string) => Promise<ProcessingStatus | null>;
  }
  
  const processingServiceRef = useRef<ProcessingService | null>(null)
```

### Fix 3.2: Added non-null assertion to processingServiceRef
*Original Code*   
```ts
      const newItems = await Promise.all(ids.map((id) => processingServiceRef.current.getStatus(id)))
```
*Corrected Code*   
```ts
      const newItems = await Promise.all(ids.map((id) => processingServiceRef.current!.getStatus(id)))
```

### Fix 3.3: Fixed translation key issues in app/page.tsx
*Original Code*   
```ts
          description: t('retryFailed', language) || 'Failed to retry document processing',
```
*Corrected Code*   
```ts
          description: 'Failed to retry document processing',
```

### Fix 3.4: Fixed more translation key issues
*Original Code*   
```ts
      // Update the document status in the UI
      setProcessingQueue(prev => prev.map(d =>
        d.id === id ? { ...d, status: 'queued', error: null } : d
      ));

      toast({
        title: t('documentRetried', language) || 'Document Retried',
        description: t('documentRetriedDesc', language) || 'Document has been queued for processing again.'
      });
```
*Corrected Code*   
```ts
      // Update the document status in the UI
      setProcessingQueue(prev => prev.map(d =>
        d.id === id ? { ...d, status: 'queued', error: undefined } : d
      ));

      toast({
        title: 'Document Retried',
        description: 'Document has been queued for processing again.'
      });
```

### Fix 3.5: Fixed last translation key issue
*Original Code*   
```ts
      toast({
        title: t('error', language) || 'Error',
        description: t('retryFailed', language) || 'Failed to retry document processing',
        variant: 'destructive'
      });
```
*Corrected Code*   
```ts
      toast({
        title: t('error', language) || 'Error',
        description: 'Failed to retry document processing',
        variant: 'destructive'
      });
```

## 4. Fixed require() style imports in JavaScript files

### Fix 4.1: Updated imports in lib/database/utils/config.js
*Original Code*   
```js
var singleton_client_1 = require("../../supabase/singleton-client");
var log_1 = require("../../log");
```
*Corrected Code*   
```js
import { getSupabaseClient } from "../../supabase/singleton-client";
import { debugLog } from "../../log";
```

### Fix 4.2: Updated reference to singleton_client_1
*Original Code*   
```js
exports.supabase = (0, singleton_client_1.getSupabaseClient)();
```
*Corrected Code*   
```js
exports.supabase = getSupabaseClient();
```

### Fix 4.3: Updated references to log_1
*Original Code*   
```js
function isSupabaseConfigured() {
    (0, log_1.debugLog)('[DEBUG] Checking Supabase configuration');
    (0, log_1.debugLog)('[DEBUG] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');
    (0, log_1.debugLog)('[DEBUG] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
    var isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    (0, log_1.debugLog)('[DEBUG] Supabase is configured:', isConfigured);
    return isConfigured;
}
```
*Corrected Code*   
```js
function isSupabaseConfigured() {
    debugLog('[DEBUG] Checking Supabase configuration');
    debugLog('[DEBUG] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');
    debugLog('[DEBUG] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
    var isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    debugLog('[DEBUG] Supabase is configured:', isConfigured);
    return isConfigured;
}
```

### Fix 4.4: Updated imports in lib/database/utils/index.js
*Original Code*   
```js
__exportStar(require("./case-conversion"), exports);
__exportStar(require("./config"), exports);
__exportStar(require("./mappers"), exports);
```
*Corrected Code*   
```js
import * as caseConversion from "./case-conversion";
import * as config from "./config";
import * as mappers from "./mappers";

export * from "./case-conversion";
export * from "./config";
export * from "./mappers";
```

### Fix 4.5: Updated imports in lib/database/utils/mappers.js
*Original Code*   
```js
var case_conversion_1 = require("./case-conversion");
```
*Corrected Code*   
```js
import { snakeToCamel } from "./case-conversion";
```

### Fix 4.6: Updated references to case_conversion_1.snakeToCamel
*Original Code*   
```js
    var status = (0, case_conversion_1.snakeToCamel)(item);
```
*Corrected Code*   
```js
    var status = snakeToCamel(item);
```

### Fix 4.7: Updated another reference to case_conversion_1.snakeToCamel
*Original Code*   
```js
    var result = (0, case_conversion_1.snakeToCamel)(item);
```
*Corrected Code*   
```js
    var result = snakeToCamel(item);
```

## 5. Fixed translation key issues in `app/documents/page.tsx`

### Fix 5.1: Fixed translation key issue
*Original Code*   
```ts
          description: t('retryFailed', language) || 'Failed to retry document processing',
```
*Corrected Code*   
```ts
          description: 'Failed to retry document processing',
```

### Fix 5.2: Fixed more translation key issues
*Original Code*   
```ts
      toast({
        title: t('documentRetried', language) || 'Document Retried',
        description: t('documentRetriedDesc', language) || 'Document has been queued for processing again.'
      });
```
*Corrected Code*   
```ts
      toast({
        title: 'Document Retried',
        description: 'Document has been queued for processing again.'
      });
```

### Fix 5.3: Fixed another translation key issue
*Original Code*   
```ts
        description: t('retryFailed', language) || 'Failed to retry document processing',
```
*Corrected Code*   
```ts
        description: 'Failed to retry document processing',
```

### Fix 5.4: Fixed error type issue
*Original Code*   
```ts
      setDocuments(prev => prev.map(d =>
        d.id === id ? { ...d, status: 'queued', error: null } : d
      ));
```
*Corrected Code*   
```ts
      setDocuments(prev => prev.map(d =>
        d.id === id ? { ...d, status: 'queued', error: undefined } : d
      ));
```

## 6. Fixed null check in `app/api/documents/[id]/signed-url/route.ts`

### Fix 6.1: Added null check for user
*Original Code*   
```ts
  // Fetch document; if bypassing, skip user_id constraint
  let query = serviceClient.from('documents').select('storage_path').eq('id', params.id)
  if (!bypassAuth) query = query.eq('user_id', user.id)
  const { data: document, error: docError } = await query.single()
```
*Corrected Code*   
```ts
  // Fetch document; if bypassing, skip user_id constraint
  let query = serviceClient.from('documents').select('storage_path').eq('id', params.id)
  if (!bypassAuth && user) {
    query = query.eq('user_id', user.id)
  } else if (!bypassAuth) {
    // If we're not bypassing auth but user is null, return unauthorized
    return NextResponse.json({ error: 'Unauthorized: User not found' }, { status: 401 })
  }
  const { data: document, error: docError } = await query.single()
```

## 7. Fixed async function calls in queue API routes

### Fix 7.1: Added await to getProcessingService in app/api/queue/[id]/cancel/route.ts
*Original Code*   
```ts
    // Get processing service with default settings
    const processingService = getProcessingService(getDefaultSettings())

    // Cancel processing
    await processingService.cancelProcessing(id)
```
*Corrected Code*   
```ts
    // Get processing service with default settings
    const processingService = await getProcessingService(getDefaultSettings())

    // Cancel processing
    await processingService.cancelProcessing(id)
```

### Fix 7.2: Added await to getProcessingService in app/api/queue/[id]/delete/route.ts
*Original Code*   
```ts
      // Get processing service with default settings
      const processingService = getProcessingService(getDefaultSettings())
      await processingService.cancelProcessing(id)
```
*Corrected Code*   
```ts
      // Get processing service with default settings
      const processingService = await getProcessingService(getDefaultSettings())
      await processingService.cancelProcessing(id)
```

## 8. Fixed type issues in database services

### Fix 8.1: Added proper type for accumulator in lib/database/services/queue-service.ts
*Original Code*   
```ts
      const mappedStatusCounts = queue.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
```
*Corrected Code*   
```ts
      const mappedStatusCounts = queue.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
```

### Fix 8.2: Fixed error type in lib/database/services/stats-service.ts
*Original Code*   
```ts
  // Get last cleared date from system_metadata
  let metadataData: Record<string, unknown> | null = null
  let metadataError: Record<string, unknown> | null = null

  const systemMetadataResult = await supabase
    .from('system_metadata')
    .select('value')
    .eq('key', 'lastCleared')
    .single()

  metadataData = systemMetadataResult.data
  metadataError = systemMetadataResult.error
```
*Corrected Code*   
```ts
  // Get last cleared date from system_metadata
  let metadataData: Record<string, unknown> | null = null
  let metadataError: unknown | null = null

  const systemMetadataResult = await supabase
    .from('system_metadata')
    .select('value')
    .eq('key', 'lastCleared')
    .single()

  metadataData = systemMetadataResult.data
  metadataError = systemMetadataResult.error
```

## 9. Fixed type issues in OCR utilities

### Fix 9.1: Added proper type for newStatus in lib/ocr/document-status-utils.ts
*Original Code*   
```ts
  newStatus: string,
```
*Corrected Code*   
```ts
  newStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled',
```

### Fix 9.2: Fixed null assignment in lib/ocr/document-status-utils.ts
*Original Code*   
```ts
    // Clear error field for non-error statuses
    document.error = null;
```
*Corrected Code*   
```ts
    // Clear error field for non-error statuses
    document.error = undefined;
```

### Fix 9.3: Fixed another null assignment in lib/ocr/document-status-utils.ts
*Original Code*   
```ts
  document.error = null;
```
*Corrected Code*   
```ts
  document.error = undefined;
```

## 10. Fixed async function calls in processing service

### Fix 10.1: Added await to hasValidOCRProvider in lib/ocr/processing-service.ts
*Original Code*   
```ts
  // Check if we have a valid OCR provider with an API key
  const hasValidProvider = state.fileProcessor.hasValidOCRProvider();

  if (hasValidProvider) {
```
*Corrected Code*   
```ts
  // Check if we have a valid OCR provider with an API key
  const hasValidProvider = await state.fileProcessor.hasValidOCRProvider();

  if (hasValidProvider) {
```

### Fix 10.2: Added await to another hasValidOCRProvider call
*Original Code*   
```ts
      // Check if we have a valid OCR provider with an API key
      const hasValidProvider = serviceState.fileProcessor.hasValidOCRProvider();

      if (hasValidProvider) {
```
*Corrected Code*   
```ts
      // Check if we have a valid OCR provider with an API key
      const hasValidProvider = await serviceState.fileProcessor.hasValidOCRProvider();

      if (hasValidProvider) {
```

### Fix 10.3: Fixed null assignment in lib/ocr/processing-service.ts
*Original Code*   
```ts
              updatedItem.error = null; // Explicitly set to null to ensure it's cleared in the database
```
*Corrected Code*   
```ts
              updatedItem.error = undefined; // Clear the error field
```

## 11. Fixed null assignments in test utilities

### Fix 11.1: Fixed null assignment in lib/tests/document-status-validation.ts
*Original Code*   
```ts
      doc.error = null;
```
*Corrected Code*   
```ts
      doc.error = undefined;
```

### Fix 11.2: Fixed another null assignment in lib/tests/document-status-validation.ts
*Original Code*   
```ts
  document.error = null;
```
*Corrected Code*   
```ts
  document.error = undefined;
```

## 12. Fixed ProcessingSettings type mismatch

### Fix 12.1: Removed extra fields from DEFAULT_PROCESSING_SETTINGS in lib/user-settings-service.ts
*Original Code*   
```ts
const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 1,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000,
  // PDF size thresholds for adaptive processing
  pdfSizeThresholds: {
    large: 100,
    veryLarge: 200,
    extreme: 500
  },
  // Chunk size limits based on PDF size
  chunkSizeLimits: {
    default: 10,
    large: 8,
    veryLarge: 5,
    extreme: 3
  },
  // Batch processing settings
  maxPagesPerBatch: 3,
  maxConcurrentPages: 2,
  saveAfterChunkThreshold: 100,
  // Result batch size settings
  resultBatchSizeThreshold: 100,
  resultBatchSizeLarge: 20,
  resultBatchSizeSmall: 50
}
```
*Corrected Code*   
```ts
const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 1,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000,
  pagesPerBatch: 3
}
```
