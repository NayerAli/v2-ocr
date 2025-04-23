-- This script fixes the settings table in Supabase
-- Run this in the Supabase SQL Editor

-- Create a function to create the settings table
CREATE OR REPLACE FUNCTION create_settings_table()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create the settings table if it doesn't exist
  CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    data JSONB NOT NULL,
    is_editable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );
  
  -- Set up Row Level Security (RLS) policies
  ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
  
  -- Check if policies already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'settings' 
    AND policyname = 'Allow all operations for authenticated users'
  ) THEN
    -- Create policies for authenticated users
    CREATE POLICY "Allow all operations for authenticated users" ON public.settings
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'settings' 
    AND policyname = 'Allow read for anonymous users'
  ) THEN
    -- Create policies for anonymous users
    CREATE POLICY "Allow read for anonymous users" ON public.settings
      FOR SELECT USING (auth.role() = 'anon');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'settings' 
    AND policyname = 'Allow insert for anonymous users'
  ) THEN
    -- Create policies for anonymous users
    CREATE POLICY "Allow insert for anonymous users" ON public.settings
      FOR INSERT WITH CHECK (auth.role() = 'anon');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'settings' 
    AND policyname = 'Allow update for anonymous users'
  ) THEN
    -- Create policies for anonymous users
    CREATE POLICY "Allow update for anonymous users" ON public.settings
      FOR UPDATE USING (auth.role() = 'anon');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'settings' 
    AND policyname = 'Allow delete for anonymous users'
  ) THEN
    -- Create policies for anonymous users
    CREATE POLICY "Allow delete for anonymous users" ON public.settings
      FOR DELETE USING (auth.role() = 'anon');
  END IF;
END;
$$;

-- Create a function to get table columns
CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
RETURNS TABLE (
  column_name text,
  data_type text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    columns.column_name::text,
    columns.data_type::text
  FROM 
    information_schema.columns
  WHERE 
    table_schema = 'public' AND
    table_name = $1;
END;
$$;

-- Insert default processing settings if they don't exist
DO $$
DECLARE
  settings_count integer;
BEGIN
  -- Check if the settings table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'settings'
  ) THEN
    -- Check if processing settings exist
    SELECT COUNT(*) INTO settings_count
    FROM public.settings
    WHERE id = 'processing';
    
    -- Insert default settings if they don't exist
    IF settings_count = 0 THEN
      INSERT INTO public.settings (
        id, 
        category, 
        data, 
        is_editable, 
        created_at, 
        updated_at
      ) VALUES (
        'processing',
        'system',
        '{"maxConcurrentJobs": 2, "pagesPerChunk": 2, "concurrentChunks": 1, "retryAttempts": 2, "retryDelay": 1000}'::jsonb,
        false,
        NOW(),
        NOW()
      );
    END IF;
  END IF;
END $$;
