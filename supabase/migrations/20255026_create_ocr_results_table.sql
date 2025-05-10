-- Create ocr_results table for storing OCR processing results
CREATE TABLE IF NOT EXISTS public.ocr_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_number INTEGER,
  text TEXT,
  confidence REAL,
  language TEXT,
  bounding_box JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ocr_results_document_id ON public.ocr_results(document_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_user_id ON public.ocr_results(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_page_number ON public.ocr_results(document_id, page_number);

-- Enable Row Level Security
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policies to ensure users can only access their own data
CREATE POLICY "Users can view their own OCR results" 
  ON public.ocr_results FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OCR results" 
  ON public.ocr_results FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OCR results" 
  ON public.ocr_results FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OCR results" 
  ON public.ocr_results FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER ocr_results_updated_at
  BEFORE UPDATE ON public.ocr_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_modified_column();

-- Grant privileges to authenticated users
GRANT ALL ON public.ocr_results TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ocr_results_id_seq TO authenticated;

-- Add function to get text count for storage measurement
CREATE OR REPLACE FUNCTION public.get_document_ocr_text_length(doc_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(LENGTH(text)), 0)::bigint
  FROM public.ocr_results
  WHERE document_id = doc_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_document_ocr_text_length(uuid) TO authenticated; 