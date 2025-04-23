# Database Schema Update Summary

## Root Causes of File Processing Issues

1. **Database Schema Mismatch**: The application was trying to use column names from the old schema with the new `documents` table, which has different column names.

   - Old schema used: `size`, `type`, `start_time`, `end_time`
   - New schema uses: `file_size`, `file_type`, `processing_started_at`, `processing_completed_at`

2. **Error Messages**:
   ```
   Error saving to queue: {code: 'PGRST204', details: null, hint: null, message: "Could not find the 'size' column of 'documents' in the schema cache"}
   ```
   and
   ```
   Error saving to queue: {code: 'PGRST204', details: null, hint: null, message: "Could not find the 'end_time' column of 'documents' in the schema cache"}
   ```

3. **Missing Document Record**: When trying to save OCR results, there was an error because the document record couldn't be found:
   ```
   Error: Document not found. Cannot save results. {code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned'}
   ```

## Changes Made

1. **Updated `ProcessingStatus` Type**:
   - Changed `size` to `fileSize`
   - Changed `type` to `fileType`
   - Changed `startTime` to `processingStartedAt`
   - Changed `endTime` to `processingCompletedAt`
   - Added `originalFilename`, `storagePath`, and `thumbnailPath` fields

2. **Updated Queue Manager**:
   - Updated the object creation to use the new field names
   - Updated status updates to use the new field names
   - Updated error handling to use the new field names

3. **Updated Queue Service**:
   - Added mapping logic to handle both old and new field names
   - Removed old fields after mapping to new fields
   - Ensured proper date conversion for the new date fields

4. **Updated Mapper Functions**:
   - Added date conversion for the new date fields
   - Ensured proper mapping between database and application formats

## Database Schema

The current database schema for the `documents` table is:

```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'queued', 'error', 'cancelled')),
    progress FLOAT DEFAULT 0,
    current_page INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    rate_limit_info JSONB
);
```

The current database schema for the `ocr_results` table is:

```sql
CREATE TABLE public.ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    language TEXT NOT NULL,
    processing_time FLOAT NOT NULL,
    page_number INTEGER NOT NULL,
    total_pages INTEGER,
    image_url TEXT,
    bounding_box JSONB,
    error TEXT,
    provider TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

## Next Steps

1. **Testing**: Test the file upload and processing flow to ensure that files are properly saved to the database and processed.

2. **Monitoring**: Monitor the application logs for any remaining errors related to the database schema.

3. **Data Migration**: Consider migrating existing data from the old schema to the new schema if needed.

4. **Documentation**: Update the application documentation to reflect the new database schema and field names.
