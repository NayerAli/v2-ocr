-- This script sets up the necessary tables and RLS policies for authentication
-- Run this in the Supabase SQL Editor

-- Update the queue table to include user_id
ALTER TABLE public.queue
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update the results table to include user_id
ALTER TABLE public.results
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update the metadata table to include user_id
ALTER TABLE public.metadata
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create a user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    ocr_settings JSONB DEFAULT '{"provider": "google", "apiKey": "", "region": "", "language": "ar"}',
    processing_settings JSONB DEFAULT '{"maxConcurrentJobs": 1, "pagesPerChunk": 2, "concurrentChunks": 1, "retryAttempts": 2, "retryDelay": 1000}',
    upload_settings JSONB DEFAULT '{"maxFileSize": 500, "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"], "maxSimultaneousUploads": 5}',
    display_settings JSONB DEFAULT '{"theme": "system", "fontSize": 14, "showConfidenceScores": true, "highlightUncertain": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;
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

-- Create RLS policies for user_profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
CREATE POLICY "Users can insert their own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Create RLS policies for user_settings table
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = id);

-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into user_profiles
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Insert into user_settings
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
