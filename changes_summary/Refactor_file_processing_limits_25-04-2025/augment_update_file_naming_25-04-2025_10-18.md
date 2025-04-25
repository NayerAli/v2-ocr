# Update File Naming Convention - 25-05-24

## Overview

This update changes the naming convention for files uploaded to storage, moving away from the "migrated_X" pattern to a more descriptive naming scheme that includes the OCR result ID.

## Changes Made

### 1. Updated Image File Naming

Changed the naming convention for image files from:
```
${user.id}/${documentId}/migrated_1.${extension}
```

To:
```
${user.id}/${documentId}/Image_${resultId}.${extension}
```

Where `resultId` is the unique ID of the OCR result, ensuring a direct connection between the stored file and its database record.

### 2. Updated PDF Page Naming

Changed the naming convention for PDF pages from:
```
${user.id}/${documentId}/page_${pageNum}.jpg
```

To:
```
${user.id}/${documentId}/Page_${pageNum}_${resultId}.jpg
```

This includes both the page number and the OCR result ID in the filename.

### 3. Added Original PDF Storage

Added code to store the original PDF file with the naming convention:
```
${user.id}/${documentId}/PDF_${resultId}.pdf
```

This ensures that the original PDF is preserved alongside the extracted page images.

### 4. Synchronized Result IDs

Updated the code to use the same ID for both the file name and the OCR result record, ensuring a direct connection between storage and database entries.

## Implementation Details

1. **For Image Files**:
   - Generate a unique ID for the OCR result
   - Use the ID in the file name: `Image_${resultId}.${extension}`
   - Set the same ID in the OCR result object

2. **For PDF Files (Direct Processing)**:
   - Generate a unique ID for the OCR result
   - Upload the original PDF as `PDF_${resultId}.pdf`
   - Set the same ID in the OCR result object

3. **For PDF Files (Page-by-Page Processing)**:
   - Upload the original PDF as `PDF_${pdfResultId}.pdf`
   - For each page, generate a unique ID
   - Upload each page as `Page_${pageNum}_${resultId}.jpg`
   - Set the corresponding ID in each OCR result object

## Benefits

1. **Improved Traceability**: Direct connection between stored files and database records
2. **Better Organization**: Clear distinction between original files and extracted pages
3. **Consistent Naming**: Standardized naming convention across all file types
4. **Easier Debugging**: More descriptive file names make it easier to identify files
5. **Preserved Originals**: Original PDF files are now stored alongside extracted pages

## Testing Notes

The changes should be tested with:
1. Various image formats (JPEG, PNG, GIF)
2. PDFs processed directly by Mistral
3. PDFs processed page by page

Verify that:
- Files are correctly named in storage
- OCR results have the correct IDs
- Original PDFs are preserved
- All files can be retrieved and displayed in the UI
