-- Create a function to estimate the total OCR results size based on text length
CREATE OR REPLACE FUNCTION public.get_total_ocr_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(LENGTH(text)), 0)::bigint
  FROM public.ocr_results;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_ocr_size() TO authenticated;
