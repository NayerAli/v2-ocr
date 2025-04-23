-- This script sets up the necessary tables in your Supabase database
-- Run this in the Supabase SQL Editor

-- Create the queue table
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
    rate_limit_info JSONB
);

-- Create the results table
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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the metadata table
CREATE TABLE IF NOT EXISTS public.metadata (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create the settings table
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    data JSONB NOT NULL,
    is_editable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_queue_status ON public.queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_created_at ON public.queue(created_at);
CREATE INDEX IF NOT EXISTS idx_results_document_id ON public.results(document_id);

-- Set up Row Level Security (RLS) policies
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON public.queue
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON public.results
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON public.metadata
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON public.settings
    FOR ALL USING (auth.role() = 'authenticated');

-- Create policies to allow read operations for anonymous users
CREATE POLICY "Allow read for anonymous users" ON public.queue
    FOR SELECT USING (auth.role() = 'anon');

CREATE POLICY "Allow read for anonymous users" ON public.results
    FOR SELECT USING (auth.role() = 'anon');

CREATE POLICY "Allow read for anonymous users" ON public.metadata
    FOR SELECT USING (auth.role() = 'anon');

CREATE POLICY "Allow read for anonymous users" ON public.settings
    FOR SELECT USING (auth.role() = 'anon');

-- Create policies to allow insert/update operations for anonymous users
CREATE POLICY "Allow insert for anonymous users" ON public.queue
    FOR INSERT WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow update for anonymous users" ON public.queue
    FOR UPDATE USING (auth.role() = 'anon');

CREATE POLICY "Allow insert for anonymous users" ON public.results
    FOR INSERT WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow update for anonymous users" ON public.results
    FOR UPDATE USING (auth.role() = 'anon');

CREATE POLICY "Allow insert for anonymous users" ON public.metadata
    FOR INSERT WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow update for anonymous users" ON public.metadata
    FOR UPDATE USING (auth.role() = 'anon');

CREATE POLICY "Allow insert for anonymous users" ON public.settings
    FOR INSERT WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow update for anonymous users" ON public.settings
    FOR UPDATE USING (auth.role() = 'anon');

-- Create policies to allow delete operations for anonymous users
CREATE POLICY "Allow delete for anonymous users" ON public.queue
    FOR DELETE USING (auth.role() = 'anon');

CREATE POLICY "Allow delete for anonymous users" ON public.results
    FOR DELETE USING (auth.role() = 'anon');

CREATE POLICY "Allow delete for anonymous users" ON public.metadata
    FOR DELETE USING (auth.role() = 'anon');

CREATE POLICY "Allow delete for anonymous users" ON public.settings
    FOR DELETE USING (auth.role() = 'anon');
