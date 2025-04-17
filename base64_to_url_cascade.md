# Cascade Analysis: Modernizing Image Storage with Supabase Bucket (`ocr-documents`)
**Date: 2025-04-17**

## Overview
This analysis details the current logic for image/PDF upload and storage, and provides a full, production-ready refactor plan using the Supabase bucket `ocr-documents` (see `database_bucket_15-04-25.md`). All proposed code is included below, with file paths and explanations. No changes are made to the codebase—this is a report only.

---

## 1. Step-by-Step Logic & Source Code (Current)

### 1.1 File Upload, Storage, and Queueing
- **Source:** `lib/ocr/queue-manager.ts`
- **Logic:**
  1. User uploads files via the UI.
  2. Each file is uploaded to Supabase storage (bucket: `ocr-documents`) using a unique path.
  3. A `ProcessingStatus` object holds the file object and storage path.
  4. All metadata is stored in the queue (IndexedDB or Supabase).

### 1.2 Image Processing and Base64 Conversion
- **Source:** `lib/ocr/file-processor.ts`
- **Logic:**
  1. For images, `processFile` calls `fileToBase64`, sending base64 to the OCR API and using it for preview in the UI.

### 1.3 PDF Processing
- **Source:** `lib/pdf-utils.ts`
- **Logic:**
  1. Each PDF page is rendered to base64, sent to the OCR API, and used for preview.

### 1.4 Results Storage
- **Source:** `lib/database/database-service.ts`, `lib/indexed-db.ts`
- **Logic:**
  1. `OCRResult` includes an `imageUrl` field, which is a data URL (base64), not a storage URL.

---

## 2. Why Base64 is Used Instead of Storage URL
- The OCR provider APIs expect base64 input.
- The UI is designed to show previews using data URLs (base64).
- There is no logic to generate/store a public storage URL for images in results.
- This increases memory and database usage, especially for large files.

---

## 3. Production-Ready Refactor: Use Supabase Storage URLs (ocr-documents)

### Supabase Bucket Details (from `database_bucket_15-04-25.md`)
- **Bucket:** `ocr-documents`
- **Allowed Types:** PDF, JPEG, PNG, TIFF, WEBP
- **Public:** false (use signed/public URLs for access)
- **File Size Limit:** 50MB

### Refactor Plan

#### 3.1 File Upload & Storage (lib/ocr/queue-manager.ts)
**Replace:**
- Store only the storage path/signed URL in `ProcessingStatus` (not the file object).
- Upload all files to the `ocr-documents` bucket.
- After upload, generate a signed URL for the file (using `createSignedUrl`).

**Proposed Code:**
```typescript
// lib/ocr/queue-manager.ts
import { supabase } from '../database/utils';

async function uploadFileToStorage(file: File, storagePath: string): Promise<string> {
  // Upload to ocr-documents bucket
  const { data, error } = await supabase.storage.from('ocr-documents').upload(storagePath, file, {
    cacheControl: '3600', upsert: true
  });
  if (error) throw new Error(error.message);

  // Generate a signed/public URL
  // Generate a signed URL (expires in 24 hours)
  const { data: urlData, error: signedError } = await supabase.storage.from('ocr-documents').createSignedUrl(storagePath, 60 * 60 * 24);
  if (signedError || !urlData?.signedUrl) throw new Error('Could not get signed URL');
  return urlData.signedUrl;
}

// Usage in addToQueue
const storagePath = `${user.id}/${crypto.randomUUID()}${fileExtension}`;
const fileUrl = await uploadFileToStorage(file, storagePath);
const status: ProcessingStatus = {
  id,
  filename: file.name,
  storagePath,
  fileUrl, // Only store the URL, not the file object
  ...otherMetadata
};
await db.saveToQueue(status);
```

#### 3.2 Processing for OCR (lib/ocr/file-processor.ts)
**Replace:**
- Fetch the file from its URL when base64 is needed for OCR.
- Do not keep base64 in the DB or result objects.

**Proposed Code:**
```typescript
// lib/ocr/file-processor.ts
async function fetchFileAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// In processFile
if (status.fileUrl) {
  const base64 = await fetchFileAsBase64(status.fileUrl);
  const result = await this.ocrProvider.processImage(base64, signal);
  result.documentId = status.id;
  result.imageUrl = status.fileUrl; // Store/display the URL, not base64
  return [result];
}
```

#### 3.3 PDF Page Handling (lib/pdf-utils.ts)
**Replace:**
- Store rendered page previews as images in the bucket, and use their signed URLs in results (using `createSignedUrl`).

**Proposed Code:**
```typescript
// lib/pdf-utils.ts
async function uploadPageImageToStorage(base64Data: string, documentId: string, pageNum: number): Promise<string> {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
  const pagePath = `${documentId}/page_${pageNum}.jpg`;
  const { data, error } = await supabase.storage.from('ocr-documents').upload(pagePath, blob, { upsert: true });
  if (error) throw new Error(error.message);
  // Generate a signed URL (expires in 24 hours)
  const { data: urlData, error: signedError } = await supabase.storage.from('ocr-documents').createSignedUrl(pagePath, 60 * 60 * 24);
  if (signedError || !urlData?.signedUrl) throw new Error('Could not get signed URL');
  return urlData.signedUrl;
}
```

#### 3.4 Results Storage (lib/database/database-service.ts, lib/indexed-db.ts)
**Replace:**
- Store only the signed URL in `OCRResult.imageUrl`, not base64.

**Proposed Code:**
```typescript
// lib/database/database-service.ts
async saveResults(documentId: string, results: OCRResult[]): Promise<void> {
  // ...
  const updatedResults = results.map(r => ({ ...r, imageUrl: r.imageUrl })); // imageUrl is now a URL
  await ResultsService.saveResults(documentId, updatedResults);
}
```

#### 3.5 UI Preview (app/documents/[id]/page.tsx or similar)
**No change needed** if the UI already supports URLs in `img.src`.

---

## 4. Handling Signed URL Expiration and Long-Term Access

### Problem
Signed URLs expire after a set duration (e.g., 24 hours). If a user tries to access a file after the URL has expired (e.g., after 7 days), access will fail unless a new signed URL is generated.

### Solution: Production-Ready Approach

#### 4.1 Store Storage Paths, Not Just Signed URLs
- **Always store the original storage path (e.g., `documentId/page_1.jpg`) in your database (e.g., in `ProcessingStatus` and `OCRResult`).**
- Only generate and use a signed URL at the time of access.
- Do not persist signed URLs in the database for long-term use.

#### 4.2 Generate Signed URLs On-Demand
- When a user requests to view or download a file (image, PDF page, etc.), generate a fresh signed URL using the stored storage path.
- Use Supabase's `createSignedUrl` method with the desired expiry (e.g., 24 hours).

#### 4.3 Detect and Handle Expired URLs
- If you cache signed URLs in the UI or client, detect access errors (e.g., HTTP 403/401) and regenerate the signed URL if needed.
- Optionally, store the expiry timestamp alongside the signed URL in memory (not in the DB) and proactively refresh before expiry.

#### 4.4 Example Workflow
1. **Upload:** Store the file in the `ocr-documents` bucket and save the storage path in the DB.
2. **Access:**
   - When the user or system needs to display or process the file, generate a signed URL from the storage path.
   - Use this signed URL for the actual file access (e.g., in an `<img>` tag or fetch request).
3. **Renewal:**
   - If access fails due to expiration, or if the user returns after a long time, repeat step 2 to generate a new signed URL.

#### 4.5 Migration Plan for Existing Data
1. Script to upload base64 blobs to `ocr-documents` bucket and update DB records with storage paths (not signed URLs).
2. Add a version flag to support both formats during migration.

---

## 5. Benefits
- Efficient, scalable, and secure storage using the `ocr-documents` bucket.
- Lower DB/memory usage and better performance.
- Easy to manage file access and expiration via Supabase.

---

## 6. File-by-File Summary of Proposed Fixes
| File Path                                 | Change Summary                                      |
|-------------------------------------------|-----------------------------------------------------|
| lib/ocr/queue-manager.ts                  | Upload to bucket, store only signed URL in status          |
| lib/ocr/file-processor.ts                 | Fetch from signed URL for OCR, store/display signed URL in result |
| lib/pdf-utils.ts                          | Store PDF page previews as images in bucket, use signed URLs         |
| lib/database/database-service.ts          | Store only signed URLs in results                          |
| lib/indexed-db.ts                         | Store only signed URLs in results                          |
| app/documents/[id]/page.tsx (UI)          | No change if UI supports URLs in img.src            |

---

## 7. Confirmation
This report proposes a full refactor to use the `ocr-documents` bucket for all result storage, with all code paths and file changes included. No changes have been made to your codebase—this is a report only. Please review and confirm if you'd like to proceed with implementation.
