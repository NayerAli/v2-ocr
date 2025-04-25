# Fix for Duplicate File Uploads - 25-05-24

## Issue Description

The application was uploading files twice to storage:

1. First upload in `queue-manager.ts` with the old naming convention (`migrated_1.extension`)
2. Second upload in `file-processor.ts` with the new naming convention (`Image_ID.extension` or `PDF_ID.pdf`)

This resulted in duplicate files in storage, wasting space and potentially causing confusion.

## Root Cause

The issue occurred because both the queue manager and file processor were independently uploading the same files to storage, but with different naming conventions.

## Changes Made

1. **Updated Queue Manager**:
   - Modified the `addToQueue` method to use the new naming convention when uploading files
   - Updated the `uploadFileToStorage` method to reflect the new naming convention in its documentation

2. **Updated File Processor**:
   - Removed duplicate file upload logic for images
   - Removed duplicate file upload logic for direct PDF processing
   - Removed duplicate file upload logic for original PDF files in page-by-page processing
   - Updated the code to use the storage path from the status object instead of uploading again
   - Kept the page-by-page PDF processing upload logic as it's still needed (each page is extracted and uploaded separately)

3. **Naming Convention**:
   - Standardized on the new naming convention in the queue manager:
     - For images: `Image_(ID).(extension)`
     - For PDFs: `PDF_(ID).pdf`
     - For other files: `File_(ID).(extension)`

## Implementation Details

### Queue Manager Changes:

```typescript
// Generate a storage path for the file using the new naming convention
const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
let storagePath;

// Use the appropriate naming convention based on file type
if (file.type.startsWith('image/')) {
  // For images: Image_(ID).(extension)
  storagePath = `${id}/Image_${id}${fileExtension}`;
} else if (file.type === 'application/pdf') {
  // For PDFs: PDF_(ID).pdf
  storagePath = `${id}/PDF_${id}.pdf`;
} else {
  // For other file types, use a generic naming convention
  storagePath = `${id}/File_${id}${fileExtension}`;
}
```

### File Processor Changes:

```typescript
// Use the storage path from the status object (already uploaded in queue manager)
const path = status.storagePath;
if (!path) {
  throw new Error("Storage path is missing from status object");
}

infoLog(`[Process] Using existing image at path: ${path}`);
```

## Benefits

1. **Reduced Storage Usage**: Files are only uploaded once, reducing storage requirements
2. **Improved Performance**: Eliminates redundant upload operations
3. **Consistent Naming**: All files use the new naming convention
4. **Cleaner Code**: Removes duplicate logic and clarifies responsibilities
5. **Better User Experience**: Faster processing as files aren't uploaded twice

## Testing Notes

The changes should be tested with:
1. Various image formats (JPEG, PNG, GIF)
2. PDFs processed directly by Mistral
3. PDFs processed page by page

Verify that:
- Files are correctly uploaded with the new naming convention
- No duplicate files are created in storage
- All processing works correctly with the existing files
- PDF pages are still correctly extracted and uploaded
