-- This script adds user_id columns and RLS policies to tables that don't have them

-- Step 1: Add user_id column to tables that don't have it
ALTER TABLE public.queue
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE public.results
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE public.metadata
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Step 2: Enable Row Level Security on all tables
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Step 3: Create RLS policies for queue table
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

-- Step 4: Create RLS policies for results table
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

-- Step 5: Create RLS policies for documents table
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

-- Step 6: Create RLS policies for metadata table
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

-- Step 7: Create RLS policies for settings table
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

-- Step 8: Create RLS policies for user_profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
CREATE POLICY "Users can insert their own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.user_profiles;
CREATE POLICY "Users can delete their own profile" ON public.user_profiles
    FOR DELETE USING (auth.uid() = id);

-- Step 9: Create RLS policies for user_settings table
DROP POLICY IF EXISTS "Users can view their own user settings" ON public.user_settings;
CREATE POLICY "Users can view their own user settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own user settings" ON public.user_settings;
CREATE POLICY "Users can insert their own user settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own user settings" ON public.user_settings;
CREATE POLICY "Users can update their own user settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete their own user settings" ON public.user_settings;
CREATE POLICY "Users can delete their own user settings" ON public.user_settings
    FOR DELETE USING (auth.uid() = id);
