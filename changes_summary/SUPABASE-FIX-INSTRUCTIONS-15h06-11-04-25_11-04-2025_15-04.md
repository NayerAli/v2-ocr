# Fixing User Settings RLS Policies in Supabase

Follow these steps to fix the Row-Level Security (RLS) policies for the `user_settings` table in Supabase:

## 1. Access the Supabase SQL Editor

1. Log in to your Supabase dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar

## 2. Run the SQL Fix Script

Copy and paste the following SQL script into the SQL Editor and run it:

```sql
-- This script fixes the RLS policies for the user_settings table

-- First, let's check if the user_settings table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'user_settings'
    ) THEN
        -- Create the user_settings table if it doesn't exist
        CREATE TABLE public.user_settings (
            id UUID PRIMARY KEY REFERENCES auth.users(id),
            ocr_settings JSONB DEFAULT '{}'::jsonb,
            processing_settings JSONB DEFAULT '{}'::jsonb,
            upload_settings JSONB DEFAULT '{}'::jsonb,
            display_settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
    END IF;
END
$$;

-- Drop existing RLS policies to start fresh
DROP POLICY IF EXISTS "Users can view their own user settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own user settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own user settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can delete their own user settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can delete their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Service role can manage all settings" ON public.user_settings;

-- Enable Row Level Security
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create a more permissive policy for authenticated users
CREATE POLICY "Authenticated users can manage their own settings" ON public.user_settings
    USING (auth.role() = 'authenticated' AND (auth.uid() = id OR id IS NULL))
    WITH CHECK (auth.role() = 'authenticated' AND (auth.uid() = id OR id IS NULL));

-- Create a policy for service role to manage all settings
CREATE POLICY "Service role can manage all settings" ON public.user_settings
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create a trigger function to automatically set the user ID
CREATE OR REPLACE FUNCTION public.set_user_id_on_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    -- Set the user ID to the current user if not provided
    IF NEW.id IS NULL THEN
        NEW.id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to automatically set the user ID
DROP TRIGGER IF EXISTS set_user_id_on_user_settings_trigger ON public.user_settings;
CREATE TRIGGER set_user_id_on_user_settings_trigger
    BEFORE INSERT ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_user_id_on_user_settings();

-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default settings for the new user
    INSERT INTO public.user_settings (
        id,
        ocr_settings,
        processing_settings,
        upload_settings,
        display_settings
    ) VALUES (
        NEW.id,
        '{
            "provider": "google",
            "apiKey": "",
            "region": "",
            "language": "ar",
            "useSystemKey": true
        }'::jsonb,
        '{
            "maxConcurrentJobs": 3,
            "pagesPerChunk": 3,
            "concurrentChunks": 3,
            "retryAttempts": 2,
            "retryDelay": 1000
        }'::jsonb,
        '{
            "maxFileSize": 500,
            "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"],
            "maxSimultaneousUploads": 5
        }'::jsonb,
        '{
            "theme": "system",
            "fontSize": 14,
            "showConfidenceScores": true,
            "highlightUncertain": true
        }'::jsonb
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Create default settings for existing users who don't have settings yet
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN
        SELECT id FROM auth.users
        WHERE id NOT IN (SELECT id FROM public.user_settings)
    LOOP
        INSERT INTO public.user_settings (
            id,
            ocr_settings,
            processing_settings,
            upload_settings,
            display_settings
        ) VALUES (
            user_record.id,
            '{
                "provider": "google",
                "apiKey": "",
                "region": "",
                "language": "ar",
                "useSystemKey": true
            }'::jsonb,
            '{
                "maxConcurrentJobs": 1,
                "pagesPerChunk": 2,
                "concurrentChunks": 1,
                "retryAttempts": 2,
                "retryDelay": 1000
            }'::jsonb,
            '{
                "maxFileSize": 500,
                "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"],
                "maxSimultaneousUploads": 5
            }'::jsonb,
            '{
                "theme": "system",
                "fontSize": 14,
                "showConfidenceScores": true,
                "highlightUncertain": true
            }'::jsonb
        );
    END LOOP;
END
$$;
```

## 3. Verify the Fix

After running the script, you can verify that the RLS policies are in place by running:

```sql
SELECT * FROM pg_policies WHERE tablename = 'user_settings';
```

You should see at least two policies:
1. "Authenticated users can manage their own settings"
2. "Service role can manage all settings"

## 4. Verify User Settings Records

Check if settings records were created for all users:

```sql
SELECT 
    auth.users.id, 
    auth.users.email, 
    CASE WHEN user_settings.id IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_settings
FROM 
    auth.users
LEFT JOIN 
    public.user_settings ON auth.users.id = user_settings.id;
```

## 5. Restart Your Application

After making these changes, restart your application to ensure the changes take effect.

## Explanation of the Fix

This fix addresses several issues:

1. **RLS Policy Issues**: The original RLS policies were too restrictive. The new policies allow authenticated users to manage their own settings.

2. **Automatic User ID Setting**: The trigger function automatically sets the user ID to the current user if not provided.

3. **Default Settings Creation**: The script creates default settings for all existing users who don't have settings yet.

4. **New User Handling**: The trigger on `auth.users` automatically creates default settings for new users when they sign up.

These changes ensure that:
- Each user can only access their own settings
- Default settings are created for all users
- The database handles most of the authentication logic, reducing the burden on the application code
