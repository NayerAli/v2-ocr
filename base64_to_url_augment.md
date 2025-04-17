# Base64 to URL Storage Analysis Report
**Date: 16-05-2024**

## Overview

This report analyzes why images are stored as base64 strings instead of storage URLs in the OCR application. It includes a detailed examination of the current implementation, the issues with this approach, and a proposed solution.

## Current Implementation

### 1. File Upload Process

The application follows this general flow for file processing:

1. **File Upload**: Files are uploaded through the UI using a dropzone component
2. **Storage Upload**: Files are uploaded to Supabase storage with a unique path
3. **Processing**: Files are processed for OCR
4. **Results Storage**: OCR results, including image data, are stored in the database

### 2. Storage Path Generation

Files are assigned a storage path based on their ID and file extension:

```typescript
// From lib/ocr/queue-manager.ts
const id = crypto.randomUUID();
const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
const storagePath = `${id}${fileExtension}`;
```

### 3. File Upload to Supabase Storage

Files are uploaded to Supabase storage before processing:

```typescript
// From lib/ocr/queue-manager.ts
private async uploadFileToStorage(file: File, storagePath: string): Promise<{ data: unknown, error: unknown }> {
  try {
    // Import the Supabase client
    const { supabase } = await import('../database/utils');

    // Get the current user to create a user-specific folder
    const { getUser } = await import('@/lib/auth');
    const user = await getUser();

    if (!user) {
      console.error('[DEBUG] User not authenticated. Cannot upload file.');
      return { data: null, error: { message: 'User not authenticated' } };
    }

    // Create a user-specific path
    const userPath = `${user.id}/${storagePath}`;

    // Upload the file to Supabase storage
    console.log('[DEBUG] Uploading file to Supabase storage:', userPath);
    const { data, error } = await supabase
      .storage
      .from('ocr-documents')
      .upload(userPath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('[DEBUG] Error uploading file to Supabase storage:', error);
      return { data: null, error };
    }

    console.log('[DEBUG] File uploaded successfully to Supabase storage');
    return { data, error: null };
  } catch (error) {
    console.error('[DEBUG] Exception in uploadFileToStorage:', error);
    return { data: null, error };
  }
}
```

### 4. Base64 Conversion for OCR Processing

During OCR processing, files are converted to base64 for API compatibility:

```typescript
// From lib/ocr/file-processor.ts
// For images
if (status.file.type.startsWith("image/")) {
  const base64 = await this.fileToBase64(status.file);

  // Check if cancelled
  if (signal.aborted) {
    console.log(`[Process] Processing aborted for ${status.filename}`);
    throw new Error("Processing aborted");
  }

  console.log(`[Process] Processing image: ${status.filename}`);
  const result = await this.ocrProvider.processImage(base64, signal);
  result.documentId = status.id;
  result.imageUrl = `data:${status.file.type};base64,${base64}`;
  console.log(`[Process] Completed image: ${status.filename}`);
  return [result];
}
```

```typescript
// From lib/ocr/file-processor.ts
private async fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(",")[1]);
    };
    reader.onerror = (error) => {
      console.error(`[Process] Error reading file:`, error);
      reject(new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`));
    };
    reader.readAsDataURL(file);
  });
}
```

### 5. PDF Page Processing

For PDFs, each page is rendered to base64 for OCR processing:

```typescript
// From lib/ocr/file-processor.ts
private async processPage(pdf: PDFDocumentProxy, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
  try {
    const page = await pdf.getPage(pageNum);
    const base64Data = await renderPageToBase64(page);

    // Check if cancelled
    if (signal.aborted) {
      console.log(`[Process] Processing aborted for page ${pageNum} of ${status.filename}`);
      throw new Error("Processing aborted");
    }

    console.log(`[Process] Processing page ${pageNum} of ${status.filename}`);
    status.currentPage = pageNum;

    // Pass the page number and total pages to the OCR provider
    const result = await this.ocrProvider.processImage(
      base64Data,
      signal,
      undefined, // fileType
      pageNum,   // pageNumber
      status.totalPages // totalPages
    );

    // ... rest of the function
  }
}
```

### 6. OCR Results Storage

The OCR results, including the base64 image data, are stored in the database:

```typescript
// From lib/database/services/results-service.ts
export async function saveResults(documentId: string, results: OCRResult[]): Promise<void> {
  // ... code to prepare results

  const supabaseResults = results.map(result => ({
    id: result.id || crypto.randomUUID(),
    document_id: documentId,
    user_id: userId,
    text: result.text || '',
    confidence: result.confidence || 0,
    language: result.language || 'en',
    processing_time: result.processingTime || 0,
    page_number: result.pageNumber || 1,
    total_pages: result.totalPages || 1,
    image_url: result.imageUrl || null,  // This stores the base64 data
    bounding_box: result.boundingBox || null,
    error: result.error || null,
    provider: result.provider || 'unknown'
  }));

  // ... code to save to database
}
```

### 7. Image Display in UI

The base64 data is used directly in the UI for displaying images:

```typescript
// From app/documents/[id]/page.tsx
// Preload image when URL changes
useEffect(() => {
  if (!currentResult?.imageUrl) return

  const img = new Image()
  img.onload = () => {
    setImageLoaded(true)
    setImageError(false)
    setIsRetrying(false)
  }
  img.onerror = () => {
    setImageError(true)
    setImageLoaded(false)
    setIsRetrying(false)
  }
  img.src = currentResult.imageUrl

  return () => {
    img.onload = null
    img.onerror = null
  }
}, [currentResult?.imageUrl])
```

```tsx
{/* From app/documents/[id]/page.tsx */}
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  ref={imageRef}
  key={`${currentResult.imageUrl}-${retryCount}`}
  src={currentResult.imageUrl}
  alt={`Page ${currentPage}`}
  className={cn(
    "max-h-[calc(100vh-14rem)] w-auto rounded-lg select-none",
    (imageLoaded || cachedImage) && !imageError ? "opacity-100" : "opacity-0",
    "transition-opacity duration-300",
    "will-change-transform"
  )}
  onLoad={handleImageLoad}
  onError={handleImageError}
  draggable={false}
  loading="eager"
  decoding="async"
/>
```

## Issues with Current Implementation

1. **Database Bloat**: Storing base64 encoded images in the database significantly increases database size, as base64 encoding increases file size by approximately 33%.

2. **Performance Impact**: Loading large base64 strings from the database is slower than loading URLs, especially for multiple images or large documents.

3. **Bandwidth Usage**: Transferring base64 data between server and client uses more bandwidth than transferring URLs.

4. **Memory Usage**: Storing and processing large base64 strings in memory can lead to higher memory usage on both server and client.

5. **Redundant Storage**: Images are stored twice - once in Supabase storage and once as base64 in the database.

## Root Cause Analysis

The root cause appears to be in the file processing logic, specifically in the `file-processor.ts` file. When processing images or PDF pages, the application:

1. Converts the file/page to base64 for OCR API compatibility
2. Stores the base64 data in the `imageUrl` field of the OCR result
3. Saves this data to the database

The key issue is in these lines:

```typescript
// For images
result.imageUrl = `data:${status.file.type};base64,${base64}`;

// For PDF pages (similar logic)
result.imageUrl = `data:image/jpeg;base64,${base64Data}`;
```

Instead of generating and storing a URL to the already uploaded file in Supabase storage, the application is storing the entire base64-encoded image data.

## Proposed Solution

### 1. Modify the OCR Processing Logic

Update the file processing logic to use signed storage URLs instead of base64 data:

```typescript
// For images
async processImage(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
  // Convert to base64 for OCR API
  const base64 = await this.fileToBase64(status.file);

  // Process with OCR provider
  const result = await this.ocrProvider.processImage(base64, signal);

  // Set document ID
  result.documentId = status.id;

  // Generate signed storage URL instead of storing base64
  result.imageUrl = await this.generateSignedUrl(status.storagePath);

  return [result];
}

// For PDF pages
async processPage(pdf: PDFDocumentProxy, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
  // Render page to base64 for OCR API
  const page = await pdf.getPage(pageNum);
  const base64Data = await renderPageToBase64(page);

  // Process with OCR provider
  const result = await this.ocrProvider.processImage(base64Data, signal);

  // For PDF pages, we need to store the rendered page
  // Upload the rendered page to storage and get a signed URL
  const pageImagePath = await this.uploadPageImageToStorage(base64Data, status.id, pageNum);
  result.imageUrl = await this.generateSignedUrl(pageImagePath);

  return result;
}

// Helper to generate signed storage URLs (valid for 24 hours)
private async generateSignedUrl(storagePath: string): Promise<string> {
  const { supabase } = await import('../database/utils');
  const { getUser } = await import('@/lib/auth');
  const user = await getUser();

  if (!user) return '';

  const userPath = `${user.id}/${storagePath}`;

  // Create a signed URL that expires in 24 hours (86400 seconds)
  const { data, error } = await supabase.storage
    .from('ocr-documents')
    .createSignedUrl(userPath, 86400);

  if (error || !data?.signedUrl) {
    console.error('Error generating signed URL:', error);
    return '';
  }

  return data.signedUrl;
}

// Helper to upload rendered PDF pages to storage
private async uploadPageImageToStorage(base64Data: string, documentId: string, pageNum: number): Promise<string> {
  const { supabase } = await import('../database/utils');
  const { getUser } = await import('@/lib/auth');
  const user = await getUser();

  if (!user) return '';

  // Convert base64 to blob
  const byteCharacters = atob(base64Data);
  const byteArrays = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArrays[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([byteArrays], { type: 'image/jpeg' });

  // Create a path for the page image
  const pagePath = `${documentId}/page_${pageNum}.jpg`;

  // Upload to storage
  const { error } = await supabase.storage
    .from('ocr-documents')
    .upload(`${user.id}/${pagePath}`, blob, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    console.error('Error uploading page image:', error);
    return '';
  }

  return pagePath;
}
```

### 2. Update the UI to Handle URLs

The UI already handles image URLs, so minimal changes would be needed. However, we need to handle URL expiration directly in the client without creating a dedicated API endpoint:

```tsx
// The existing code should work with signed URLs as well
<img
  ref={imageRef}
  key={`${currentResult.imageUrl}-${retryCount}`}
  src={currentResult.imageUrl}
  alt={`Page ${currentPage}`}
  onError={handleImageError}
  // ... other props
/>
```

To handle URL expiration, we'll add a function to refresh expired URLs directly using the Supabase client:

```typescript
// Import the Supabase client
import { supabase } from '@/lib/database/utils';

// Add this to the document view component
async function refreshImageUrl(result: OCRResult): Promise<string> {
  // If the URL is not a signed URL or is still valid, return it
  if (!result.imageUrl || !result.imageUrl.includes('token=')) {
    return result.imageUrl || '';
  }

  try {
    // Get the document to extract storage path information
    const { data: document } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', result.documentId)
      .single();

    if (!document) return result.imageUrl;

    // Determine the storage path based on whether it's a page or the original document
    let storagePath;
    if (result.pageNumber > 0) {
      // For PDF pages, we use a predictable path pattern
      storagePath = `${result.documentId}/page_${result.pageNumber}.jpg`;
    } else {
      // For original documents, use the stored path
      storagePath = document.storage_path;
    }

    // Create a new signed URL directly using the Supabase client
    const { data, error } = await supabase.storage
      .from('ocr-documents')
      .createSignedUrl(`${supabase.auth.user()?.id}/${storagePath}`, 86400); // 24 hours

    if (error || !data?.signedUrl) {
      console.error('Error generating signed URL:', error);
      return result.imageUrl;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error refreshing image URL:', error);
    return result.imageUrl;
  }
}

// Enhanced image error handler
const handleImageError = useCallback(async () => {
  if (!currentResult) return;

  // If image fails to load, it might be due to an expired URL
  // Try to refresh the URL and update the image
  try {
    setImageError(true);
    setImageLoaded(false);

    // Get a fresh URL
    const freshUrl = await refreshImageUrl(currentResult);

    // If we got a new URL, update the result and retry loading
    if (freshUrl && freshUrl !== currentResult.imageUrl) {
      setCurrentResult({...currentResult, imageUrl: freshUrl});
      setRetryCount(prev => prev + 1);
      return;
    }
  } catch (err) {
    console.error('Failed to refresh image URL:', err);
  }

  // If we couldn't refresh the URL, show the error state
  toast({
    variant: "destructive",
    title: "Image Load Error",
    description: "Failed to load image preview. You can still view the extracted text.",
  });
}, [currentResult, toast]);

// Use this when the component mounts to preload images
useEffect(() => {
  if (!currentResult?.imageUrl) return;

  const loadImage = async () => {
    // For signed URLs that might be expired, try to refresh first
    if (currentResult.imageUrl.includes('token=')) {
      const freshUrl = await refreshImageUrl(currentResult);

      // If we got a new URL, update the result
      if (freshUrl !== currentResult.imageUrl) {
        setCurrentResult({...currentResult, imageUrl: freshUrl});
        return; // The effect will run again with the new URL
      }
    }

    // Load the image
    const img = new Image();
    img.onload = () => {
      setImageLoaded(true);
      setImageError(false);
      // Cache the successfully loaded image URL
      imageCache.set(currentResult.imageUrl, true);
    };
    img.onerror = handleImageError;
    img.src = currentResult.imageUrl;
  };

  loadImage();
}, [currentResult?.imageUrl, handleImageError]);
```

### 3. Migration Strategy

For existing data:

1. Create a migration script to:
   - Extract base64 data from the database
   - Upload it to Supabase storage
   - Generate signed URLs
   - Update the database records with the new URLs

2. Add a version flag to the application to handle both old (base64) and new (URL) formats during the transition period.

```typescript
// Migration script (pseudo-code)
async function migrateBase64ToSignedUrls() {
  // Get all OCR results with base64 image URLs
  const { data: results } = await supabase
    .from('ocr_results')
    .select('id, document_id, page_number, image_url, user_id')
    .like('image_url', 'data:%');

  for (const result of results) {
    // Extract base64 data
    const base64Match = result.image_url.match(/^data:(.+);base64,(.+)$/);
    if (!base64Match) continue;

    const contentType = base64Match[1];
    const base64Data = base64Match[2];

    // Convert to blob
    const byteCharacters = atob(base64Data);
    const byteArrays = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArrays[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteArrays], { type: contentType });

    // Upload to storage
    const storagePath = `${result.user_id}/${result.document_id}/page_${result.page_number}.jpg`;
    await supabase.storage.from('ocr-documents').upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: true
    });

    // Generate signed URL
    const { data } = await supabase.storage
      .from('ocr-documents')
      .createSignedUrl(storagePath, 86400);

    if (data?.signedUrl) {
      // Update the database record
      await supabase
        .from('ocr_results')
        .update({ image_url: data.signedUrl })
        .eq('id', result.id);
    }
  }
}
```

## Benefits of the Proposed Solution

1. **Reduced Database Size**: Storing URLs instead of base64 data will significantly reduce database size.

2. **Improved Performance**: Loading URLs is faster than loading large base64 strings.

3. **Reduced Bandwidth Usage**: Transferring URLs uses less bandwidth than transferring base64 data.

4. **Lower Memory Usage**: Processing URLs requires less memory than processing base64 strings.

5. **Single Source of Truth**: Images are stored only once in Supabase storage.

6. **Better Scalability**: The solution scales better with increasing numbers of documents and users.

7. **Enhanced Security**: Signed URLs provide better security than public URLs, as they:
   - Expire after a set time (24 hours in our implementation)
   - Cannot be easily guessed or accessed without the token
   - Provide an additional layer of access control beyond RLS policies

## Conclusion

The current implementation stores images as base64 data in the database, which causes performance and storage issues. By modifying the application to use signed storage URLs instead, we can significantly improve performance, reduce database size, and create a more scalable and secure solution.

The key changes needed are in the file processing logic, specifically in how the `imageUrl` field is populated in the OCR results. Instead of storing base64 data, we should generate and store signed URLs to the files in Supabase storage.

Additionally, we need to implement a client-side mechanism to refresh signed URLs when they expire, ensuring a seamless user experience even with long-lived documents. By handling URL refreshing directly in the browser using the Supabase client, we avoid the need for additional API endpoints while still maintaining security and performance. This approach provides the best balance of simplicity, security, and user experience.

# Why Are Images Stored as Base64 Instead of Storage URLs?

## Step-by-Step Code and Logic Analysis

### 1. **Image Upload, Processing, and Storage Flow**

#### a. **File Processing Entry Point**
- **File:** `lib/ocr/file-processor.ts`
- **Function:** `processFile`

```ts
async processFile(status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult[]> {
  // ...
  if (status.file.type.startsWith("image/")) {
    const base64 = await this.fileToBase64(status.file);
    // ...
    const result = await this.ocrProvider.processImage(base64, signal);
    result.documentId = status.id;
    result.imageUrl = `data:${status.file.type};base64,${base64}`;
    // ...
    return [result];
  }
  // ...
}
```
- **Explanation:**
  - Images are read as base64 using `fileToBase64`.
  - The base64 string is sent to the OCR provider and also stored as a data URL in `result.imageUrl`.

#### b. **PDF Page Processing**
- **File:** `lib/ocr/file-processor.ts`
- **Function:** `processPage`

```ts
private async processPage(pdf: PDFDocumentProxy, pageNum: number, status: ProcessingStatus, signal: AbortSignal): Promise<OCRResult> {
  // ...
  const base64Data = await renderPageToBase64(page);
  // ...
  const result = await this.ocrProvider.processImage(
    base64Data,
    signal,
    undefined, // fileType
    pageNum,   // pageNumber
    status.totalPages // totalPages
  );
  result.imageUrl = `data:image/jpeg;base64,${base64Data}`;
  // ...
  return result;
}
```
- **Explanation:**
  - Each PDF page is rendered to a base64 JPEG and stored as a data URL in `result.imageUrl`.

#### c. **Base64 Conversion Helper**
- **File:** `lib/ocr/file-processor.ts`
- **Function:** `fileToBase64`

```ts
private async fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(",")[1]);
    };
    reader.onerror = (error) => {
      reject(new Error(`Failed to read file: ${error}`));
    };
    reader.readAsDataURL(file);
  });
}
```
- **Explanation:**
  - Converts files to base64 strings for further processing and storage.

#### d. **OCR Provider Usage**
- **File:** `lib/ocr/providers/mistral.ts`, `google.ts`, `microsoft.ts`
- **Function:** `processImage`
- **Example:**
```ts
async processImage(base64Data: string, signal: AbortSignal, ...): Promise<OCRResult> {
  // ...
  // For Mistral: wraps base64 in a data URL and sends to API
  const dataPrefix = "data:image/jpeg;base64,";
  const requestBody = {
    model: "mistral-ocr-latest",
    document: {
      type: "image_url",
      image_url: `${dataPrefix}${base64Data}`
    }
  };
  // ...
}
```
- **Explanation:**
  - All providers expect base64 data, either as a raw string or as a data URL.

#### e. **Database Storage**
- **File:** `lib/database/services/results-service.ts`
- **Function:** `saveResults`

```ts
const preparedResult = {
  // ...
  image_url: imageUrl || (result as any).image_url || result.imageUrl || null,
  // ...
}
```
- **Explanation:**
  - The `imageUrl` field (which is a base64 data URL) is stored directly in the database.

#### f. **UI Usage**
- **File:** `app/documents/page.tsx`
- **Usage:**
```ts
<img src={currentResult.imageUrl} ... />
```
- **Explanation:**
  - The UI directly uses the base64 data URL for image rendering.

### 2. **Summary: Why Base64 is Used**
- The current architecture reads files as base64, processes them as base64, and stores the base64 data URL in the database for direct use in the UI.
- There is no step where the image is uploaded to a storage service (e.g., Supabase Storage, S3) and a URL is generated.
- This approach is simple but inefficient for large images or many users, as it bloats the database and increases network payloads.

---

# Proposal: Production-Ready Solution Using Storage URLs

## Goals
- Store images in a dedicated storage bucket (e.g., Supabase Storage, S3).
- Save only the storage URL (not the base64 data) in the database.
- Serve images via CDN-backed URLs for performance and scalability.

## Step-by-Step Solution (Pseudocode/Outline)

### 1. **Upload Image to Storage**
- When a file is uploaded or a PDF page is rendered, upload the binary/image to storage.
- Get the public (or signed) URL after upload.

```ts
import { supabase } from '@/lib/database/utils'

async function uploadImageToStorage(file: File, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
  if (error) throw error
  // Get public URL
  const { publicURL } = supabase.storage.from('images').getPublicUrl(path)
  return publicURL
}
```

### 2. **Update Processing Logic**
- After upload, store the returned URL in `result.imageUrl` instead of a base64 data URL.

```ts
const imageUrl = await uploadImageToStorage(file, `user/${userId}/${documentId}/page-${pageNum}.jpg`)
result.imageUrl = imageUrl
```

### 3. **Database Storage**
- The `imageUrl` field in the database now contains a CDN-backed URL, not a base64 string.

### 4. **UI Usage**
- The UI continues to use `imageUrl` as the image source, but now it is a performant URL.

### 5. **Migration**
- Optionally, write a migration script to convert existing base64 images to storage URLs.

---

# Next Steps
- Review this report and proposal.
- If approved, proceed to refactor the codebase to use storage URLs for images instead of base64 data URLs.
