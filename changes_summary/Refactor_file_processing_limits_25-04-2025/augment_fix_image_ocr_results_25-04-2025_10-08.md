# Fix for Image OCR Results Not Saving - 25-05-24

## Issue Description

When processing image files, the OCR results were not being saved to the `ocr_results` table in the database. The issue was that while PDF files had a mechanism to save results to the database, image files were missing this step.

The logs showed that images were properly uploaded to storage and processed by the OCR provider, but the results were not appearing in the database.

## Root Cause

In the `file-processor.ts` file, there were two code paths that were not saving OCR results to the database:

1. **Image Processing**: When processing image files, the code was returning the result array but not saving it to the database.
2. **Direct PDF Processing**: When using Mistral's direct PDF processing capability, the results were also not being saved to the database.

In contrast, the page-by-page PDF processing method was correctly saving each result using `await db.saveResults(status.id, [batchResults[i]])`.

## Changes Made

1. **Fixed Image Processing**:
   - Added code to save the OCR result to the database after processing an image
   - Set `pageNumber` and `totalPages` to 1 for images (these were missing)
   - Added logging to confirm when results are saved

2. **Fixed Direct PDF Processing**:
   - Added code to save the OCR result to the database after direct PDF processing
   - Set `pageNumber` to 1 for direct processing (this was missing)
   - Added logging to confirm when results are saved

## Implementation Details

### Image Processing Fix:

```typescript
// Process the image with OCR
const result = await this.ocrProvider.processImage(base64, signal);
result.documentId = status.id;
result.pageNumber = 1; // Set page number to 1 for images
result.totalPages = 1; // Set total pages to 1 for images
result.storagePath = path;
result.imageUrl = imageUrl; // Use the signed URL instead of base64

// Import database service for saving the result
const { db } = await import('@/lib/database');

// Save the result to the database
await db.saveResults(status.id, [result]);
infoLog(`[Process] Saved result for image: ${status.filename}`);
```

### Direct PDF Processing Fix:

```typescript
// Process PDF directly
const result = await this.ocrProvider.processPdfDirectly(base64Data, signal);
result.documentId = status.id;
result.pageNumber = 1; // Set page number to 1 for direct processing
result.totalPages = numPages;
result.storagePath = path;
result.imageUrl = pdfUrl; // Use the signed URL instead of base64

// Import database service for saving the result
const { db } = await import('@/lib/database');

// Save the result to the database
await db.saveResults(status.id, [result]);
infoLog(`[Process] Saved result for direct PDF processing: ${status.filename}`);
```

## Benefits

1. **Consistent Behavior**: All file types (images and PDFs) now save their OCR results to the database
2. **Complete Data**: OCR results for images are now properly stored and can be retrieved later
3. **Improved User Experience**: Users can now view OCR results for all processed files
4. **Better Debugging**: Added logging makes it easier to track when results are saved

## Testing Notes

The changes should be tested with:
1. Various image formats (JPEG, PNG, GIF)
2. PDFs processed directly by Mistral
3. PDFs processed page by page

Verify that:
- OCR results are saved to the database for all file types
- Page numbers and total pages are set correctly
- Results can be retrieved and displayed in the UI
