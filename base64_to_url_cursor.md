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

# Proposal: Production-Ready Solution Using **Signed URLs** (with `ocr-documents` Bucket)

## Why Use Signed URLs?
- **Signed URLs** ensure that only authenticated users (or those with a valid, temporary token) can access the files, even if they know the path.
- This is more secure than public URLs, especially for private or sensitive documents.

## Step-by-Step Solution (with Full Source Code)

### 1. **Upload Image to Storage in `ocr-documents` Bucket**

#### **File:** `lib/ocr/file-processor.ts`

**Helper to upload images and generate a signed URL:**

```typescript
// lib/ocr/file-processor.ts
import { supabase } from '@/lib/database/utils'
import { getUser } from '@/lib/auth'

async function uploadImageToOcrDocumentsBucketAndGetSignedUrl(file: Blob | File, documentId: string, pageNum?: number): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error('User not authenticated');
  const path = pageNum
    ? `${user.id}/${documentId}/page_${pageNum}.jpg`
    : `${user.id}/${documentId}/original.jpg`;
  const { error } = await supabase.storage.from('ocr-documents').upload(path, file, { upsert: true });
  if (error) throw error;
  // Generate a signed URL (valid for 1 hour, adjust as needed)
  const { data, error: signError } = await supabase.storage.from('ocr-documents').createSignedUrl(path, 60 * 60);
  if (signError || !data?.signedUrl) throw new Error('Failed to get signed URL');
  return data.signedUrl;
}
```

### 2. **Update Image Processing Logic**

#### **File:** `lib/ocr/file-processor.ts`

**Replace base64 storage with signed URL:**

```typescript
// ... existing code ...
if (status.file.type.startsWith('image/')) {
  // Upload original image to storage and get signed URL
  const imageUrl = await uploadImageToOcrDocumentsBucketAndGetSignedUrl(status.file, status.id);
  // Convert to base64 for OCR API only
  const base64 = await this.fileToBase64(status.file);
  const result = await this.ocrProvider.processImage(base64, signal);
  result.documentId = status.id;
  result.imageUrl = imageUrl; // Store only the signed URL
  return [result];
}
// ... existing code ...
```

### 3. **Update PDF Page Processing Logic**

#### **File:** `lib/ocr/file-processor.ts`

**Upload each rendered page to storage and store the signed URL:**

```typescript
private async processPage(
  pdf: PDFDocumentProxy,
  pageNum: number,
  status: ProcessingStatus,
  signal: AbortSignal
): Promise<OCRResult> {
  const page = await pdf.getPage(pageNum);
  const base64Data = await renderPageToBase64(page);
  // Convert base64 to Blob
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
  // Upload to storage and get signed URL
  const imageUrl = await uploadImageToOcrDocumentsBucketAndGetSignedUrl(blob, status.id, pageNum);
  // OCR API call
  const result = await this.ocrProvider.processImage(base64Data, signal, undefined, pageNum, status.totalPages);
  result.imageUrl = imageUrl; // Store only the signed URL
  return result;
}
```

### 4. **Database Storage**

#### **File:** `lib/database/services/results-service.ts`

**No change needed if `result.imageUrl` is now a signed URL:**

```typescript
// The image_url field will now store a signed URL, not base64 data
image_url: result.imageUrl || null,
```

### 5. **UI Usage**

#### **File:** `app/documents/page.tsx`

**No change needed:**

```tsx
<img src={currentResult.imageUrl} ... />
```

### 6. **Signed URL Expiry Handling (Recommended)**
- Signed URLs expire (e.g., after 1 hour). If the user reloads the page after expiry, the image will not load.
- **Best practice:**
  - On the client, detect 403/expired image loads and request a fresh signed URL from your backend (or re-generate it in the UI if you have access to the path and user context).
  - Optionally, store the storage path in the DB (in addition to the signed URL) to allow easy re-generation.

### 7. **Migration Script (Optional)**

#### **File:** `scripts/migrate-base64-to-signed-url.ts` (proposed new file)

**Outline:**
- For each OCR result with a base64 `imageUrl`,
  - Convert base64 to Blob
  - Upload to `ocr-documents` bucket
  - Generate a signed URL
  - Update DB record with the new signed URL

```typescript
import { supabase } from '@/lib/database/utils'
import { getUser } from '@/lib/auth'

async function migrateBase64ImagesToSignedUrls() {
  // Fetch all OCR results with base64 imageUrl
  const { data: results } = await supabase.from('ocr_results').select('*');
  for (const result of results) {
    if (result.image_url?.startsWith('data:image/')) {
      // Convert base64 to Blob
      const base64 = result.image_url.split(',')[1];
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
      // Upload to storage
      const user = await getUser();
      const path = `${user.id}/${result.document_id}/migrated_${result.page_number || 1}.jpg`;
      const { error } = await supabase.storage.from('ocr-documents').upload(path, blob, { upsert: true });
      if (error) continue;
      // Generate signed URL
      const { data: signData, error: signError } = await supabase.storage.from('ocr-documents').createSignedUrl(path, 60 * 60);
      if (signError || !signData?.signedUrl) continue;
      // Update DB
      await supabase.from('ocr_results').update({ image_url: signData.signedUrl }).eq('id', result.id);
    }
  }
}
```

---

# Handling Signed URL Expiration and Renewal

## Problem
- Signed URLs generated by Supabase (or any storage provider) have a limited validity period (e.g., 1 hour).
- If a user tries to access an image after the signed URL has expired (e.g., after 7 days), the image will not load (HTTP 403 or similar error).

## Logic and Best Practices

### 1. **Store the Storage Path**
- In addition to storing the signed URL in the database, always store the storage path (e.g., `userId/documentId/page_1.jpg`).
- This allows you to regenerate a new signed URL at any time, for any user who is authorized.

### 2. **Detect Expired URLs in the UI**
- In the client (e.g., in `app/documents/page.tsx`), detect when an image fails to load due to an expired signed URL (e.g., by listening for the `onError` event on the `<img>` tag and checking for a 403 response).

### 3. **Regenerate the Signed URL**
- When an expired URL is detected, trigger a request to your backend (or, if you have the path and user context in the client, directly to Supabase) to generate a new signed URL for the stored path.
- Replace the expired URL in the UI with the new one, so the image loads again.

### 4. **Authorization**
- Ensure that only the user who owns the file (or is authorized) can request a new signed URL for that file path.
- This is typically enforced in your backend API or in your Supabase RLS (Row Level Security) policies.

### 5. **User Experience**
- The renewal process should be seamless for the user: if an image fails to load due to expiration, the UI should automatically attempt to fetch a new signed URL and reload the image, without requiring manual refresh or intervention.

## Summary
- The provided solution recommends and anticipates this logic, but does not implement it.
- To be production-ready, you must:
  - Store the storage path in the database.
  - Implement a mechanism (API or client logic) to regenerate signed URLs as needed.
  - Ensure proper authorization for signed URL renewal.

---

# Next Steps
- If you want to see the code for this renewal logic, let me know and I can provide a detailed implementation plan and code snippets for your codebase.

---

# Production-Ready Implementation: Signed URL Renewal Logic (Client-Only, No API Endpoint)

## 1. Store the Storage Path in the Database

### **File:** `lib/database/services/results-service.ts`

**When saving OCR results, store the storage path (not the signed URL):**

```typescript
// Add a new field: storage_path
storage_path: result.storagePath || null,
```

- Update your `OCRResult` type to include `storagePath?: string`.
- When uploading an image, set `storagePath` (e.g., `userId/documentId/page_1.jpg`).

## 2. Client-Side Logic to Generate and Renew Signed URLs

### **File:** `app/documents/page.tsx`

```typescript
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/database/utils';

function DocumentImage({ storagePath }: { storagePath: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const generateSignedUrl = useCallback(async () => {
    const { data, error } = await supabase.storage.from('ocr-documents').createSignedUrl(storagePath, 60 * 60 * 24); // 24h
    if (data?.signedUrl) setSignedUrl(data.signedUrl);
    // Optionally handle error
  }, [storagePath]);

  useEffect(() => {
    generateSignedUrl();
  }, [generateSignedUrl]);

  const handleImageError = useCallback(() => {
    // If the image fails to load (expired), try to generate a new signed URL
    generateSignedUrl();
    setRetryCount((c) => c + 3);
  }, [generateSignedUrl]);

  return (
    <img
      key={`${signedUrl}-${retryCount}`}
      src={signedUrl || ''}
      alt="OCR page"
      onError={handleImageError}
      // ...other props
    />
  );
}
```

## 3. Security
- Ensure your Supabase RLS (Row Level Security) policies only allow users to generate signed URLs for their own files.
- The client can only generate signed URLs for files it has the storage path for, and only if the user is authenticated.

## 4. Workflow Summary
1. **Upload:** Store the file in the `ocr-documents` bucket and save the storage path in the DB.
2. **Access:**
   - When the user or system needs to display or process the file, generate a signed URL from the storage path in the client using the Supabase JS client.
   - Use this signed URL for the actual file access (e.g., in an `<img>` tag or fetch request).
3. **Renewal:**
   - If access fails due to expiration, or if the user returns after a long time, the client generates a new signed URL on demand.

## 5. Update OCRResult Type

### **File:** `types/index.ts`

```typescript
export interface OCRResult {
  // ...existing fields
  storagePath?: string // <-- add this
}
```

---

# Summary
- The system now stores the storage path for each image.
- When a signed URL expires, the client detects the error and generates a new signed URL using the Supabase JS client.
- The UI updates the image source seamlessly, providing a robust, secure, and user-friendly experience.
- **No custom API endpoint is required.**

---

# Codebase Update Checklist for Client-Only Signed URL Storage

## 1. Files/Components to Update

| File/Component                                 | What to Update/Replace                                                                 |
|------------------------------------------------|----------------------------------------------------------------------------------------|
| `types/index.ts`                               | Add `storagePath` to `OCRResult`                                                      |
| `lib/ocr/queue-manager.ts`                     | Store storage path on upload in `ProcessingStatus`                                     |
| `lib/ocr/file-processor.ts`                    | Store per-page image storage path in `OCRResult`; remove signed URL logic              |
| `lib/database/services/results-service.ts`     | Save/fetch `storage_path` for each result                                              |
| `app/documents/[id]/page.tsx`                  | Generate signed URL from `storagePath` in the client; update all image display logic   |
| `ocr_results` table (DB)                       | Add `storage_path` column if missing                                                   |
| Documentation/tests/scripts                    | Update to reference `storagePath` and client-side signed URL generation                |

### Per-File Notes
- **types/index.ts**: Add `storagePath?: string` to `OCRResult`.
- **lib/ocr/queue-manager.ts**: When uploading, generate and store the storage path in `ProcessingStatus.storagePath`.
- **lib/ocr/file-processor.ts**: For each page/image, upload to bucket and store the path in `OCRResult.storagePath`. Do not generate/store signed URLs here.
- **lib/database/services/results-service.ts**: Save and fetch `storage_path` for each result.
- **app/documents/[id]/page.tsx**: On mount and on error, use Supabase client to call `createSignedUrl(storagePath, expiresIn)`. Use the resulting signed URL as the `src` for `<img>`. Update preloading, retry, and error logic to use the new approach.
- **ocr_results table**: Add `storage_path` column if missing.

---

# Ensuring Smooth User Experience for Large PDFs

## Problem
- With the old approach, the entire PDF (or all page images) could be loaded into memory as base64, making navigation instant but at the cost of high memory and DB usage.
- With the new approach, each page image is stored in the bucket and loaded via signed URL, which could introduce latency if not handled well.

## Solution: Progressive, Chunked, and Preloaded Loading

### 1. **Page-by-Page Loading**
- Only load the current page image when the user navigates to it.
- Do not fetch all page images at once.

### 2. **Preload Next/Previous Pages**
- When the user is on page N, start preloading N+3 and N-3 in the background using their storage paths and signed URLs.
- This ensures that navigation to the next/previous page feels instant.

### 3. **Progressive Rendering**
- Show a loading spinner or skeleton for the page image while it is being fetched.
- As soon as the image is loaded, display it and remove the spinner.

### 4. **Chunked Fetching for Very Large PDFs**
- If the PDF has hundreds of pages, consider only fetching metadata and the first few pages initially.
- Load additional pages on demand as the user scrolls or navigates.

### 5. **Caching**
- Use an in-memory cache (e.g., a Map of page numbers to loaded images) to avoid re-fetching images the user has already viewed.

### 6. **No Degradation in UX**
- The user should never wait for the entire document to load before seeing the first page.
- Navigation between pages should be as fast as possible, leveraging preloading and caching.

## Example (UI Logic in `app/documents/[id]/page.tsx`)
- On page change, generate a signed URL for the current, next, and previous pages.
- Preload these images in the background.
- Use a loading indicator for any page that is not yet loaded.
- If a signed URL expires, regenerate it on error and retry loading.

---

# Summary
- All relevant files and database columns are listed for update.
- The new approach is designed to be at least as smooth as the current base64-in-memory approach, with progressive, chunked, and preloaded loading for large PDFs.
- The plan is actionable and ready for implementation.

---

# Final Checklist: Secure, Complete, and Error-Free Migration

## 1. Supabase RLS (Row Level Security) for Storage
- **Goal:** Only allow users to access/generate signed URLs for their own files.
- **How:**
  - In the Supabase dashboard, go to the `storage.objects` table.
  - Enable RLS (Row Level Security).
  - Add this policy (SQL example):
    ```sql
    -- Allow access only if the user owns the file (user_id is in the path)
    CREATE POLICY "Users can access their own files" ON storage.objects
      FOR SELECT USING (
        auth.uid()::text = split_part(name, '/', 1)
      );
    ```
  - This ensures only the user whose ID is the first part of the storage path (e.g., `user-1234/…`) can access/generate signed URLs for those files.

## 2. Database Migration
- **Add `storage_path` column to `ocr_results` if missing:**
  ```sql
  ALTER TABLE ocr_results ADD COLUMN storage_path text;
  ```
- **(Optional) Migrate old data:**
  - For existing results, update `storage_path` with the correct path for each image/page.

## 3. Code & UI Update Checklist
- [ ] Update all backend and UI code to use `storagePath` for all file/image access (see summary table above).
- [ ] Remove any logic that expects base64 or static URLs in `imageUrl`.
- [ ] In the UI, always generate signed URLs on demand using the Supabase client and `storagePath`.
- [ ] Preload next/previous pages as described for smooth UX.
- [ ] Test with large PDFs to ensure navigation is instant and smooth.

## 4. Testing & Verification
- [ ] Test with multiple users: ensure users cannot access each other's files/images.
- [ ] Test signed URL renewal: let a URL expire, then verify the UI can regenerate and reload the image.
- [ ] Test upload, processing, and preview for both images and PDFs (all pages).
- [ ] Test migration of old data if applicable.

---

# Migration Complete
- If you follow all steps above, your system will be secure, efficient, and user-friendly for both small and large documents, with no ambiguity or missing steps.
