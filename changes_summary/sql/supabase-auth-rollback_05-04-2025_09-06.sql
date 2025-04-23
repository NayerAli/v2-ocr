-- This script reverts the changes made by supabase-auth-setup.sql
-- Run this in the Supabase SQL Editor

-- Drop the trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function that handles new user signups
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Remove RLS policies for user_settings table
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;

-- Remove RLS policies for user_profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;

-- Remove RLS policies for metadata table
DROP POLICY IF EXISTS "Users can view their own metadata" ON public.metadata;
DROP POLICY IF EXISTS "Users can insert their own metadata" ON public.metadata;
DROP POLICY IF EXISTS "Users can update their own metadata" ON public.metadata;
DROP POLICY IF EXISTS "Users can delete their own metadata" ON public.metadata;

-- Remove RLS policies for results table
DROP POLICY IF EXISTS "Users can view their own results" ON public.results;
DROP POLICY IF EXISTS "Users can insert their own results" ON public.results;
DROP POLICY IF EXISTS "Users can update their own results" ON public.results;
DROP POLICY IF EXISTS "Users can delete their own results" ON public.results;

-- Remove RLS policies for queue table
DROP POLICY IF EXISTS "Users can view their own queue items" ON public.queue;
DROP POLICY IF EXISTS "Users can insert their own queue items" ON public.queue;
DROP POLICY IF EXISTS "Users can update their own queue items" ON public.queue;
DROP POLICY IF EXISTS "Users can delete their own queue items" ON public.queue;

-- Drop the user_settings table
DROP TABLE IF EXISTS public.user_settings;

-- Drop the user_profiles table
DROP TABLE IF EXISTS public.user_profiles;

-- Remove user_id column from metadata table
ALTER TABLE public.metadata DROP COLUMN IF EXISTS user_id;

-- Remove user_id column from results table
ALTER TABLE public.results DROP COLUMN IF EXISTS user_id;

-- Remove user_id column from queue table
ALTER TABLE public.queue DROP COLUMN IF EXISTS user_id;

-- Restore original RLS policies if needed
-- You may need to recreate the original policies that were in place before

-- Create policies to allow all operations for authenticated users (original policies)
-- Note: We first check if the policy exists before creating it
DO $$
BEGIN
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'metadata'
    AND policyname = 'Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users" ON public.metadata
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;

  -- Create policies to allow read operations for anonymous users (original policies)
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'metadata'
    AND policyname = 'Allow read for anonymous users'
  ) THEN
    CREATE POLICY "Allow read for anonymous users" ON public.metadata
      FOR SELECT USING (auth.role() = 'anon');
  END IF;
END
$$;
