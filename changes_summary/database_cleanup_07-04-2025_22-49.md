# Database Cleanup Plan

Based on the analysis of the database schema, here are the SQL commands to clean up the database.

## Tables to Keep
- `documents` - Stores document information
- `queue` - Manages processing queue
- `results` - Stores OCR processing results
- `user_profiles` - Stores user profile information
- `user_settings` - Stores user-specific settings
- `settings` - Stores system-wide settings
- `metadata` - Stores system metadata

## Tables Analysis

After careful analysis of the codebase, I've determined that all tables currently in the database are being used by the application. The tables serve the following purposes:

1. `documents` - Stores information about uploaded documents
2. `queue` - Manages the processing queue for OCR jobs
3. `results` - Stores the OCR results for processed documents
4. `user_profiles` - Stores user profile information
5. `user_settings` - Stores user-specific settings (OCR provider, API key, etc.)
6. `settings` - Stores system-wide settings (processing settings, etc.)
7. `metadata` - Stores system metadata (last cleared date, etc.)

## SQL Commands for Cleanup

Before executing these commands, make sure to back up your database!

```sql
-- Step 1: Check the structure of all tables

-- Check the structure of the documents table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'documents';

-- Check the structure of the queue table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'queue';

-- Check the structure of the results table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'results';

-- Check the structure of the user_profiles table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles';

-- Check the structure of the user_settings table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_settings';

-- Check the structure of the settings table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'settings';

-- Check the structure of the metadata table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'metadata';

-- Step 2: Check if all tables have the user_id column for proper user isolation

-- Check if the queue table has a user_id column
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'queue'
  AND column_name = 'user_id'
);

-- Check if the results table has a user_id column
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'results'
  AND column_name = 'user_id'
);

-- Check if the documents table has a user_id column
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'documents'
  AND column_name = 'user_id'
);

-- Step 3: Verify that Row Level Security (RLS) is enabled on all tables

-- Check if RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

## Important Notes

1. **BACKUP YOUR DATABASE BEFORE RUNNING THESE COMMANDS**
2. Run the SELECT queries to verify the structure of your tables
3. Make sure all tables have the necessary columns for user isolation
4. Ensure Row Level Security (RLS) is enabled on all tables

## Additional SQL Commands for User Isolation

If any tables are missing the user_id column or don't have RLS enabled, use these commands to fix them:

```sql
-- Add user_id column to tables that don't have it
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Enable RLS on all tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for documents table
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
CREATE POLICY "Users can view their own documents" ON public.documents
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
CREATE POLICY "Users can insert their own documents" ON public.documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
CREATE POLICY "Users can update their own documents" ON public.documents
    FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents" ON public.documents
    FOR DELETE USING (auth.uid() = user_id);
```

## Verification Steps After Checking

1. Test document uploading and processing
2. Test user settings saving and retrieval
3. Test OCR processing and results viewing
4. Verify that all user-specific data is properly isolated
