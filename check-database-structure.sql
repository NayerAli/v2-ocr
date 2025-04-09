-- This script checks the structure of the database tables and ensures they have the necessary columns for user isolation

-- Step 1: Check which tables exist in the database
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public';

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

-- Check if the metadata table has a user_id column
SELECT EXISTS (
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'metadata' 
  AND column_name = 'user_id'
);

-- Check if the settings table has a user_id column
SELECT EXISTS (
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'settings' 
  AND column_name = 'user_id'
);

-- Step 3: Verify that Row Level Security (RLS) is enabled on all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Step 4: Check the structure of all tables
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

-- Check the structure of the documents table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'documents';

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

-- Step 5: Check if RLS policies are set up correctly
-- List all RLS policies
SELECT n.nspname as schema,
       c.relname as table,
       pol.polname as policy,
       pol.polcmd as command,
       pol.polpermissive as permissive,
       pg_get_expr(pol.polqual, pol.polrelid) as using_qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY schema, table, policy;
