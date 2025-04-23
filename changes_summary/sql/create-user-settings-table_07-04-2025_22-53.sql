-- This script creates the user_settings table if it doesn't exist

-- Check if the user_settings table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'user_settings'
    ) THEN
        -- Create the user_settings table
        CREATE TABLE public.user_settings (
            id UUID PRIMARY KEY REFERENCES auth.users(id),
            ocr_settings JSONB DEFAULT '{}'::jsonb,
            processing_settings JSONB DEFAULT '{}'::jsonb,
            upload_settings JSONB DEFAULT '{}'::jsonb,
            display_settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        -- Enable Row Level Security
        ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        CREATE POLICY "Users can view their own user settings" ON public.user_settings
            FOR SELECT USING (auth.uid() = id);

        CREATE POLICY "Users can insert their own user settings" ON public.user_settings
            FOR INSERT WITH CHECK (auth.uid() = id);

        CREATE POLICY "Users can update their own user settings" ON public.user_settings
            FOR UPDATE USING (auth.uid() = id);

        CREATE POLICY "Users can delete their own user settings" ON public.user_settings
            FOR DELETE USING (auth.uid() = id);

        RAISE NOTICE 'Created user_settings table';
    ELSE
        RAISE NOTICE 'user_settings table already exists';
    END IF;
END
$$;
