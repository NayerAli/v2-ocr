-- Add the data column if it doesn't exist
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Insert processing settings with an integer ID
DO $$
DECLARE
  next_id INTEGER;
BEGIN
  -- Check if processing settings already exist by key
  IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'processing') THEN
    -- Get the next available ID
    SELECT COALESCE(MAX(id), 0) + 1 INTO next_id FROM public.settings;
    
    -- Insert with an integer ID
    INSERT INTO public.settings (id, key, value, data)
    VALUES (
      next_id, -- Use the next available ID
      'processing',
      '{}'::jsonb,
      '{"maxConcurrentJobs": 2, "pagesPerChunk": 2, "concurrentChunks": 1, "retryAttempts": 2, "retryDelay": 1000}'::jsonb
    );
    RAISE NOTICE 'Inserted processing settings with ID %', next_id;
  ELSE
    -- Update existing record
    UPDATE public.settings
    SET data = '{"maxConcurrentJobs": 2, "pagesPerChunk": 2, "concurrentChunks": 1, "retryAttempts": 2, "retryDelay": 1000}'::jsonb,
        updated_at = NOW()
    WHERE key = 'processing';
    RAISE NOTICE 'Updated existing processing settings';
  END IF;
END $$;
