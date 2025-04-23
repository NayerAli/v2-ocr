# File Processing Fixes

## Root Causes of File Processing Issues

1. **Missing Storage Path**: The main issue was that we were trying to save a document to the database without a `storage_path`, which is a required field in the `documents` table.

   Error message:
   ```
   Error saving to queue: {code: '23502', details: null, hint: null, message: 'null value in column "storage_path" of relation "documents" violates not-null constraint'}
   ```

2. **File Upload Process**: The application was not uploading files to Supabase storage before saving the document record to the database.

3. **Document Not Found**: When trying to save OCR results, there was an error because the document record couldn't be found:
   ```
   Error: Document not found. Cannot save results. {code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned'}
   ```

## Changes Made

1. **Updated Queue Manager**:
   - Added storage path generation for files
   - Added file upload to Supabase storage
   - Added proper error handling for file uploads

2. **Updated Queue Service**:
   - Added fallback for missing storage path
   - Improved field mapping between old and new schema
   - Enhanced error handling

3. **Added Server-Side Logging**:
   - Created a comprehensive server-side logging system
   - Added API request and response logging
   - Removed sensitive data from logs

4. **Fixed Cookie Logging**:
   - Updated middleware to avoid printing cookie values in console logs
   - Added proper redaction of sensitive information

## Implementation Details

### Storage Path Generation

Files are now assigned a storage path based on their ID and file extension:

```typescript
const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
const storagePath = `${id}${fileExtension}`;
```

### File Upload to Supabase Storage

Files are now uploaded to Supabase storage before saving the document record:

```typescript
const userPath = `${user.id}/${storagePath}`;
const { data, error } = await supabase
  .storage
  .from('documents')
  .upload(userPath, file, {
    cacheControl: '3600',
    upsert: true
  });
```

### Fallback for Missing Storage Path

Added a fallback for missing storage path in the queue service:

```typescript
storagePath: statusWithoutFile.storagePath || `${statusWithoutFile.id}${statusWithoutFile.fileType || '.unknown'}`,
```

### Server-Side Logging

Created a comprehensive server-side logging system:

```typescript
logServerMessage('API', `${method} ${pathname}`, { 
  requestId, 
  params,
  headers: Object.fromEntries(
    Array.from(req.headers.entries())
      .filter(([key]) => !['cookie', 'authorization'].includes(key.toLowerCase()))
  )
})
```

## Next Steps

1. **Testing**: Test the file upload and processing flow to ensure that files are properly saved to the database and processed.

2. **Monitoring**: Monitor the application logs for any remaining errors related to the file processing.

3. **Error Handling**: Improve error handling for edge cases, such as when a file upload fails or when a document record can't be found.

4. **User Experience**: Enhance the user experience by providing better feedback during file uploads and processing.
