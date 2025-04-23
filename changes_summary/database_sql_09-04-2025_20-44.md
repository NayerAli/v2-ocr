```sql
-- Database Cleanup and Optimization Script for Supabase SQL Editor
-- IMPORTANT: Make a backup of your database before running this script!

-- Step 1: Drop all existing tables (since we're starting fresh with test data)
DROP TABLE IF EXISTS public.results CASCADE;
DROP TABLE IF EXISTS public.queue CASCADE;
DROP TABLE IF EXISTS public.metadata CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;

-- Step 2: Create optimized tables with proper relationships

-- Create the user_profiles table
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    organization TEXT,
    role TEXT DEFAULT 'user',
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the user_settings table
CREATE TABLE public.user_settings (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    ocr_settings JSONB DEFAULT '{
        "provider": "google",
        "apiKey": "",
        "region": "",
        "language": "ar",
        "useSystemKey": true
    }'::jsonb,
    processing_settings JSONB DEFAULT '{
        "maxConcurrentJobs": 1,
        "pagesPerChunk": 2,
        "concurrentChunks": 1,
        "retryAttempts": 2,
        "retryDelay": 1000
    }'::jsonb,
    upload_settings JSONB DEFAULT '{
        "maxFileSize": 500,
        "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"],
        "maxSimultaneousUploads": 5
    }'::jsonb,
    display_settings JSONB DEFAULT '{
        "theme": "system",
        "fontSize": 14,
        "showConfidenceScores": true,
        "highlightUncertain": true
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the documents table (main table for document storage)
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

-- Create the ocr_results table (for storing OCR results)
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

-- Create the system_settings table (for global system settings)
CREATE TABLE public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    is_editable BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the system_metadata table (for system-wide metadata)
CREATE TABLE public.system_metadata (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Step 3: Create indexes for better performance
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_created_at ON public.documents(created_at);
CREATE INDEX idx_ocr_results_document_id ON public.ocr_results(document_id);
CREATE INDEX idx_ocr_results_user_id ON public.ocr_results(user_id);

-- Step 4: Enable Row Level Security on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metadata ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies for user_profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
CREATE POLICY "Users can insert their own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Step 6: Create RLS policies for user_settings table
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = id);

-- Step 7: Create RLS policies for documents table
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
CREATE POLICY "Users can view their own documents" ON public.documents
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
CREATE POLICY "Users can insert their own documents" ON public.documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
CREATE POLICY "Users can update their own documents" ON public.documents
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents" ON public.documents
    FOR DELETE USING (auth.uid() = user_id);

-- Step 8: Create RLS policies for ocr_results table
DROP POLICY IF EXISTS "Users can view their own results" ON public.ocr_results;
CREATE POLICY "Users can view their own results" ON public.ocr_results
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own results" ON public.ocr_results;
CREATE POLICY "Users can insert their own results" ON public.ocr_results
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own results" ON public.ocr_results;
CREATE POLICY "Users can update their own results" ON public.ocr_results
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own results" ON public.ocr_results;
CREATE POLICY "Users can delete their own results" ON public.ocr_results
    FOR DELETE USING (auth.uid() = user_id);

-- Step 9: Create RLS policies for system tables (admin only)
DROP POLICY IF EXISTS "Only admins can manage system settings" ON public.system_settings;
CREATE POLICY "Only admins can manage system settings" ON public.system_settings
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM public.user_profiles WHERE role = 'admin'
    ));

DROP POLICY IF EXISTS "Only admins can manage system metadata" ON public.system_metadata;
CREATE POLICY "Only admins can manage system metadata" ON public.system_metadata
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM public.user_profiles WHERE role = 'admin'
    ));

-- Step 10: Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into user_profiles
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email);

  -- Insert into user_settings with default values
  INSERT INTO public.user_settings (id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 11: Insert default system settings
INSERT INTO public.system_settings (key, value, is_editable)
VALUES
('processing', '{"maxConcurrentJobs": 2, "pagesPerChunk": 2, "concurrentChunks": 1, "retryAttempts": 2, "retryDelay": 1000}', true),
('ocr_defaults', '{"provider": "google", "language": "en"}', true),
('upload_limits', '{"maxFileSize": 500, "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"], "maxSimultaneousUploads": 5}', true)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();

-- Step 12: Verify the changes
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- List all RLS policies
SELECT n.nspname as schema,
       c.relname as "table",
       pol.polname as policy,
       pol.polcmd as command,
       pol.polpermissive as permissive,
       pg_get_expr(pol.polqual, pol.polrelid) as using_qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY schema, "table", policy;
```