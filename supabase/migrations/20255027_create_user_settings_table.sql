-- Create user_settings table for storing API keys and other user-specific settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ocr_settings JSONB DEFAULT '{
    "provider": "azure",
    "apiKey": "",
    "useSystemKey": false,
    "azureEndpoint": "",
    "defaultLanguage": "en"
  }'::jsonb,
  processing_settings JSONB DEFAULT '{
    "maxFileSize": 10485760,
    "allowedFileTypes": ["pdf", "jpg", "jpeg", "png", "tiff", "tif", "gif"],
    "parallelProcessing": true,
    "maxParallelJobs": 3,
    "timeout": 600
  }'::jsonb,
  upload_settings JSONB DEFAULT '{
    "maxFileSize": 10485760,
    "allowMultiple": true,
    "maxFiles": 5
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view only their own settings" 
  ON public.user_settings FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" 
  ON public.user_settings FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
  ON public.user_settings FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings" 
  ON public.user_settings FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_modified_column();

-- Grant privileges to authenticated users
GRANT ALL ON public.user_settings TO authenticated;

-- Create function to get current user settings
CREATE OR REPLACE FUNCTION public.get_current_user_settings()
RETURNS SETOF public.user_settings
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT * FROM public.user_settings 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_settings() TO authenticated; 