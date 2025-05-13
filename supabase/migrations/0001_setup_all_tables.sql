-- This script sets up all the necessary tables for the application

-- Create the queue table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.queue (
    id UUID PRIMARY KEY,
    filename TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'queued', 'error', 'cancelled')),
    progress FLOAT,
    error TEXT,
    size INTEGER,
    type TEXT,
    current_page INTEGER,
    total_pages INTEGER,
    start_time BIGINT,
    end_time BIGINT,
    completion_time BIGINT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    rate_limit_info JSONB,
    user_id UUID REFERENCES auth.users(id)
);

-- Create the results table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.results (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.queue(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    language TEXT NOT NULL,
    processing_time FLOAT NOT NULL,
    page_number INTEGER NOT NULL,
    total_pages INTEGER,
    image_url TEXT,
    bounding_box JSONB,
    error TEXT,
    rate_limit_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id)
);

-- Create the metadata table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.metadata (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id)
);

-- Create the settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    data JSONB NOT NULL,
    is_editable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id)
);

-- Create the documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    filename TEXT NOT NULL,
    size INTEGER,
    type TEXT,
    content_type TEXT,
    storage_path TEXT,
    thumbnail_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the user_profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    organization TEXT,
    role TEXT,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the user_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    ocr_settings JSONB DEFAULT '{}'::jsonb,
    processing_settings JSONB DEFAULT '{}'::jsonb,
    upload_settings JSONB DEFAULT '{}'::jsonb,
    display_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_queue_status ON public.queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_created_at ON public.queue(created_at);
CREATE INDEX IF NOT EXISTS idx_queue_user_id ON public.queue(user_id);
CREATE INDEX IF NOT EXISTS idx_results_document_id ON public.results(document_id);
CREATE INDEX IF NOT EXISTS idx_results_user_id ON public.results(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);

-- Enable Row Level Security on all tables
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for queue table
DROP POLICY IF EXISTS "Users can view their own queue items" ON public.queue;
CREATE POLICY "Users can view their own queue items" ON public.queue
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert their own queue items" ON public.queue;
CREATE POLICY "Users can insert their own queue items" ON public.queue
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own queue items" ON public.queue;
CREATE POLICY "Users can update their own queue items" ON public.queue
    FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete their own queue items" ON public.queue;
CREATE POLICY "Users can delete their own queue items" ON public.queue
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for results table
DROP POLICY IF EXISTS "Users can view their own results" ON public.results;
CREATE POLICY "Users can view their own results" ON public.results
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert their own results" ON public.results;
CREATE POLICY "Users can insert their own results" ON public.results
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own results" ON public.results;
CREATE POLICY "Users can update their own results" ON public.results
    FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete their own results" ON public.results;
CREATE POLICY "Users can delete their own results" ON public.results
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for metadata table
DROP POLICY IF EXISTS "Users can view their own metadata" ON public.metadata;
CREATE POLICY "Users can view their own metadata" ON public.metadata
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert their own metadata" ON public.metadata;
CREATE POLICY "Users can insert their own metadata" ON public.metadata
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own metadata" ON public.metadata;
CREATE POLICY "Users can update their own metadata" ON public.metadata
    FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete their own metadata" ON public.metadata;
CREATE POLICY "Users can delete their own metadata" ON public.metadata
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for settings table
DROP POLICY IF EXISTS "Users can view their own settings" ON public.settings;
CREATE POLICY "Users can view their own settings" ON public.settings
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.settings;
CREATE POLICY "Users can insert their own settings" ON public.settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own settings" ON public.settings;
CREATE POLICY "Users can update their own settings" ON public.settings
    FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete their own settings" ON public.settings;
CREATE POLICY "Users can delete their own settings" ON public.settings
    FOR DELETE USING (auth.uid() = user_id);

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