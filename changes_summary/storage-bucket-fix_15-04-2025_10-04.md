# Storage Bucket Fix

## Root Cause of the Issue

The main issue was that the application was trying to upload files to a Supabase storage bucket named 'documents', but the actual bucket in the database is named 'ocr-documents'. This resulted in a "Bucket not found" error when trying to upload files.

Error message:
```
[DEBUG] Error uploading file to Supabase storage: {statusCode: '404', error: 'Bucket not found', message: 'Bucket not found'}
```

## Changes Made

1. **Updated Queue Manager**:
   - Changed the storage bucket name from 'documents' to 'ocr-documents' to match the actual bucket name in the database.

2. **Added Server-Side Console Logging**:
   - Created a comprehensive server-side console logging system to ensure API requests are properly logged in the terminal.
   - Added middleware for API routes to log requests and responses.

## Implementation Details

### Storage Bucket Name Update

Updated the storage bucket name in the queue manager:

```typescript
const { data, error } = await supabase
  .storage
  .from('ocr-documents') // Changed from 'documents' to 'ocr-documents'
  .upload(userPath, file, {
    cacheControl: '3600',
    upsert: true
  });
```

### Server-Side Console Logging

Created a server-side console logging system:

```typescript
export function withConsoleApiLogging(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const method = req.method
    const url = req.url
    const pathname = req.nextUrl.pathname
    
    // Generate a unique request ID
    const requestId = crypto.randomUUID().substring(0, 8)
    
    // Log the request
    console.log(`[SERVER-API] [${requestId}] ${method} ${pathname}`)
    
    const startTime = Date.now()
    
    try {
      // Call the original handler
      const response = await handler(req)
      
      // Calculate duration
      const duration = Date.now() - startTime
      
      // Log the response
      console.log(`[SERVER-API] [${requestId}] ${method} ${pathname} - ${response.status} in ${duration}ms`)
      
      return response
    } catch (error: any) {
      // Log error
      console.error(`[SERVER-API] [${requestId}] ${method} ${pathname} - ERROR:`, error.message || 'Unknown error')
      
      // Return a 500 error response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}
```

## Next Steps

1. **Testing**: Test the file upload and processing flow to ensure that files are properly uploaded to the correct storage bucket.

2. **Monitoring**: Monitor the application logs for any remaining errors related to file uploads.

3. **API Logging**: Ensure that all API routes use the new console logging system to improve debugging capabilities.

4. **Error Handling**: Enhance error handling for edge cases, such as when a storage bucket doesn't exist or when a file upload fails.
