-- This script creates the documents table if it doesn't exist

-- Check if the documents table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'documents'
    ) THEN
        -- Create the documents table
        CREATE TABLE public.documents (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id),
            filename TEXT NOT NULL,
            size INTEGER,
            type TEXT,
            content_type TEXT,
            storage_path TEXT,
            thumbnail_path TEXT,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        -- Create indexes
        CREATE INDEX idx_documents_user_id ON public.documents(user_id);
        CREATE INDEX idx_documents_created_at ON public.documents(created_at);

        -- Enable Row Level Security
        ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        CREATE POLICY "Users can view their own documents" ON public.documents
            FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

        CREATE POLICY "Users can insert their own documents" ON public.documents
            FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own documents" ON public.documents
            FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

        CREATE POLICY "Users can delete their own documents" ON public.documents
            FOR DELETE USING (auth.uid() = user_id);

        RAISE NOTICE 'Created documents table';
    ELSE
        RAISE NOTICE 'documents table already exists';
    END IF;
END
$$;
