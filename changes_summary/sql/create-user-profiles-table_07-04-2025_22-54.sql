-- This script creates the user_profiles table if it doesn't exist

-- Check if the user_profiles table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'user_profiles'
    ) THEN
        -- Create the user_profiles table
        CREATE TABLE public.user_profiles (
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

        -- Enable Row Level Security
        ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        CREATE POLICY "Users can view their own profile" ON public.user_profiles
            FOR SELECT USING (auth.uid() = id);

        CREATE POLICY "Users can insert their own profile" ON public.user_profiles
            FOR INSERT WITH CHECK (auth.uid() = id);

        CREATE POLICY "Users can update their own profile" ON public.user_profiles
            FOR UPDATE USING (auth.uid() = id);

        CREATE POLICY "Users can delete their own profile" ON public.user_profiles
            FOR DELETE USING (auth.uid() = id);

        RAISE NOTICE 'Created user_profiles table';
    ELSE
        RAISE NOTICE 'user_profiles table already exists';
    END IF;
END
$$;
