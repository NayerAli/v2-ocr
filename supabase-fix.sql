-- This script fixes the queue table to ensure it works with the application
-- Run this in the Supabase SQL Editor

-- First, let's check if we need to recreate the queue table
DO $$
BEGIN
    -- Drop the foreign key constraint from results table
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'results_document_id_fkey' 
        AND table_name = 'results'
    ) THEN
        ALTER TABLE public.results DROP CONSTRAINT results_document_id_fkey;
    END IF;

    -- Drop the foreign key constraint from results table (alternative name)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'results_document_id_fkey1' 
        AND table_name = 'results'
    ) THEN
        ALTER TABLE public.results DROP CONSTRAINT results_document_id_fkey1;
    END IF;

    -- Drop and recreate the queue table
    DROP TABLE IF EXISTS public.queue;
    
    -- Create the queue table with the correct schema
    CREATE TABLE public.queue (
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
    
    -- Drop and recreate the results table
    DROP TABLE IF EXISTS public.results;
    
    -- Create the results table with the correct schema
    CREATE TABLE public.results (
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
    
    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_queue_status ON public.queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_created_at ON public.queue(created_at);
    CREATE INDEX IF NOT EXISTS idx_results_document_id ON public.results(document_id);
    
    -- Set up Row Level Security (RLS) policies
    ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
    
    -- Create policies to allow all operations for authenticated users
    -- First check if policies exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'queue' 
        AND policyname = 'Allow all operations for authenticated users'
    ) THEN
        CREATE POLICY "Allow all operations for authenticated users" ON public.queue
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'results' 
        AND policyname = 'Allow all operations for authenticated users'
    ) THEN
        CREATE POLICY "Allow all operations for authenticated users" ON public.results
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    
    -- Create policies to allow read operations for anonymous users
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'queue' 
        AND policyname = 'Allow read for anonymous users'
    ) THEN
        CREATE POLICY "Allow read for anonymous users" ON public.queue
            FOR SELECT USING (auth.role() = 'anon');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'results' 
        AND policyname = 'Allow read for anonymous users'
    ) THEN
        CREATE POLICY "Allow read for anonymous users" ON public.results
            FOR SELECT USING (auth.role() = 'anon');
    END IF;
    
    -- Create policies to allow insert/update operations for anonymous users
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'queue' 
        AND policyname = 'Allow insert for anonymous users'
    ) THEN
        CREATE POLICY "Allow insert for anonymous users" ON public.queue
            FOR INSERT WITH CHECK (auth.role() = 'anon');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'queue' 
        AND policyname = 'Allow update for anonymous users'
    ) THEN
        CREATE POLICY "Allow update for anonymous users" ON public.queue
            FOR UPDATE USING (auth.role() = 'anon');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'results' 
        AND policyname = 'Allow insert for anonymous users'
    ) THEN
        CREATE POLICY "Allow insert for anonymous users" ON public.results
            FOR INSERT WITH CHECK (auth.role() = 'anon');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'results' 
        AND policyname = 'Allow update for anonymous users'
    ) THEN
        CREATE POLICY "Allow update for anonymous users" ON public.results
            FOR UPDATE USING (auth.role() = 'anon');
    END IF;
    
    -- Create policies to allow delete operations for anonymous users
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'queue' 
        AND policyname = 'Allow delete for anonymous users'
    ) THEN
        CREATE POLICY "Allow delete for anonymous users" ON public.queue
            FOR DELETE USING (auth.role() = 'anon');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'results' 
        AND policyname = 'Allow delete for anonymous users'
    ) THEN
        CREATE POLICY "Allow delete for anonymous users" ON public.results
            FOR DELETE USING (auth.role() = 'anon');
    END IF;
    
END $$;
