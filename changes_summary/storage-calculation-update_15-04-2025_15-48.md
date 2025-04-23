# Storage Calculation Update

## Overview
This update fixes the storage calculation in the application to display the actual storage used by summing the file sizes from all documents in the database.

## Problem
Previously, the application was using an estimation method to calculate storage usage:
```javascript
// Calculate approximate size (this is an estimation)
const estimatedSizePerRecord = 2 // KB
const estimatedSize = ((documentsCount || 0) + (resultsCount || 0)) * estimatedSizePerRecord / 1024 // Convert to MB
```

This approach had several issues:
1. It didn't reflect the actual file sizes stored in the database
2. It used a fixed size per record (2KB) which is not accurate for different file types
3. It didn't account for the varying sizes of documents

## Solution
The updated implementation now:
1. Queries the actual file sizes from the documents table
2. Sums them up to get the total storage used
3. Converts the total from bytes to MB for display
4. Adds a small estimation for OCR results storage

```javascript
// Get the sum of file sizes from the documents table
const { data: fileSizeData, error: fileSizeError } = await supabase
  .from('documents')
  .select('file_size')

let totalFileSize = 0
if (!fileSizeError && fileSizeData) {
  // Sum up all file sizes
  totalFileSize = fileSizeData.reduce((sum, doc) => sum + (doc.file_size || 0), 0)
} else {
  console.error('Error getting file sizes:', fileSizeError)
}

// Convert total file size from bytes to MB
const totalFileSizeMB = totalFileSize / (1024 * 1024)

// Add a small amount for OCR results and metadata (estimation)
const ocrResultsEstimatedSizeMB = (resultsCount || 0) * 0.01 // Assuming each OCR result is about 10KB

// Total size in MB
const totalSizeMB = totalFileSizeMB + ocrResultsEstimatedSizeMB
```

## Benefits
1. **Accuracy**: The storage calculation now reflects the actual file sizes stored in the database
2. **Transparency**: Users can see the real storage usage of their documents
3. **Better planning**: More accurate storage information helps users manage their storage limits

## Implementation Details
- Updated the `getDatabaseStats` function in `lib/database/services/stats-service.ts`
- Added a query to get all file sizes from the documents table
- Summed up the file sizes and converted from bytes to MB
- Added a small estimation for OCR results storage (10KB per result)
- Rounded the final value for display

## Testing
The application has been tested to ensure it starts correctly with the new storage calculation implementation.
