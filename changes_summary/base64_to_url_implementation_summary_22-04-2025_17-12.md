# Base64 to Signed URL Implementation Summary
**Date: 16-05-2024 17:12**

## Issue Fixed

The application was storing images as base64 data in the database despite uploading them to Supabase storage. This caused:

1. Database bloat due to storing large base64 strings
2. Performance issues when loading images
3. Redundant storage of the same data

## Root Cause

The issue had two main causes:

1. In `file-processor.ts`, the application was correctly uploading files to Supabase storage and generating signed URLs, but it wasn't consistently using these URLs in the OCR results. In some cases, the base64 data was still being stored in the `imageUrl` field of the OCR results.

2. In `results-service.ts`, there was a column name mismatch. The code was trying to save to a column named `imageUrl` (camelCase), but the database schema has the column named `image_url` (snake_case).

## Changes Made

1. **Updated `file-processor.ts`**:
   - Added explicit comments to use signed URLs instead of base64 data
   - Added logging to track the generation of signed URLs
   - Ensured all image processing paths use the signed URL

2. **Fixed `results-service.ts`**:
   - Added `imageUrl` to the list of properties that need to be converted to snake_case
   - Added the `image_url` field to the prepared result object

3. **Created Migration Script**:
   - Created a new script `scripts/migrate-base64-to-signed-url.js` to:
     - Find all OCR results with base64 image URLs
     - Upload the base64 data to Supabase storage if not already uploaded
     - Generate signed URLs for the uploaded files
     - Update the database records with the signed URLs and storage paths

## Current Implementation Status

### 1. File Upload and Storage

Files are uploaded to Supabase storage with a unique path:

```typescript
// From lib/ocr/file-processor.ts
const path = `${user.id}/${status.id}/migrated_1${this.getExtensionForMime(status.file.type)}`;
const { error: uploadError } = await supabase
  .storage
  .from('ocr-documents')
  .upload(path, status.file, { upsert: true });
```

### 2. Signed URL Generation

Signed URLs are generated using the `generateSignedUrl` method:

```typescript
// From lib/ocr/file-processor.ts
private async generateSignedUrl(storagePath: string): Promise<string> {
  try {
    const supabase = getSupabaseClient();
    const user = await getUser();

    if (!user) {
      console.error('[Process] User not authenticated. Cannot generate signed URL.');
      return '';
    }

    // Create a signed URL that expires in 24 hours (86400 seconds)
    const { data, error } = await supabase.storage
      .from('ocr-documents')
      .createSignedUrl(storagePath, 86400);

    if (error || !data?.signedUrl) {
      console.error('[Process] Error generating signed URL:', error);
      return '';
    }

    return data.signedUrl;
  } catch (error) {
    console.error('[Process] Exception in generateSignedUrl:', error);
    return '';
  }
}
```

### 3. OCR Result Storage

OCR results are stored with both the storage path and the signed URL:

```typescript
// From lib/ocr/file-processor.ts
result.documentId = status.id;
result.storagePath = path;
result.imageUrl = imageUrl;
```

### 4. URL Refreshing in UI

The document view component has a `refreshSignedUrl` function to handle URL expiration:

```typescript
// From app/documents/[id]/page.tsx
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

### 5. Error Handling for Expired URLs

The document view component also handles image loading errors by refreshing the signed URL:

```typescript
// From app/documents/[id]/page.tsx
const handleImageError = useCallback(async () => {
  setImageError(true);
  setImageLoaded(false);

  // If this is the first error, try to refresh the URL automatically
  if (retryCount === 0 && currentResult?.storagePath) {
    try {
      setIsRetrying(true);
      const refreshedUrl = await refreshSignedUrl(currentResult);
      if (refreshedUrl) {
        // The URL has been refreshed in the state, so the image will reload
        setImageError(false);
        setRetryCount(prev => prev + 1);
        return;
      }
    } catch (error) {
      console.error('Error auto-refreshing image URL:', error);
    } finally {
      setIsRetrying(false);
    }
  }

  toast({
    variant: "destructive",
    title: "Image Load Error",
    description: "Failed to load image preview. You can still view the extracted text.",
  });
}, [toast, retryCount, currentResult, refreshSignedUrl]);
```

### 6. Migration Scripts

There are several migration scripts available to convert existing base64 data to signed URLs:

1. `migrate-base64-to-storage-live.js`
2. `migrate-base64-to-storage-admin.js`
3. `migrate-base64-to-storage-fixed.js`
4. `scripts/migrate-base64-to-storage.ts`

These scripts extract base64 data from the database, upload it to Supabase storage, and update the database records with the storage path.

## How to Run the Migration

To convert existing base64 data to signed URLs, run the migration script:

```bash
node scripts/migrate-base64-to-signed-url.js
```

This will find all OCR results with base64 image URLs, upload the images to Supabase storage, generate signed URLs, and update the database records.

## Benefits

1. **Reduced Database Size**: Storing URLs instead of base64 data significantly reduces database size
2. **Improved Performance**: Loading URLs is faster than loading large base64 strings
3. **Reduced Bandwidth Usage**: Transferring URLs uses less bandwidth than transferring base64 data
4. **Lower Memory Usage**: Processing URLs requires less memory than processing base64 strings
5. **Single Source of Truth**: Images are stored only once in Supabase storage
6. **Enhanced Security**: Signed URLs provide better security than public URLs

## Verification

After running the migration script, you can verify the changes by:

1. Checking the database to ensure no OCR results have base64 image URLs
2. Uploading new documents and verifying they use signed URLs
3. Viewing documents in the UI to ensure images load correctly

## Next Steps

1. Monitor the application to ensure all new uploads use signed URLs
2. Consider adding a periodic job to refresh expired signed URLs
3. Update any other parts of the application that might still be using base64 data
