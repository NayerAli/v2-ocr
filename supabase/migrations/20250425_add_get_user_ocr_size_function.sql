-- Create a function to estimate the total OCR results size for a specific user
CREATE OR REPLACE FUNCTION public.get_user_ocr_size(user_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(LENGTH(text)), 0)::bigint
  FROM public.ocr_results
  WHERE ocr_results.user_id = get_user_ocr_size.user_id;
$$;

-- Create a function to get the total OCR size for the current user
CREATE OR REPLACE FUNCTION public.get_current_user_ocr_size()
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT public.get_user_ocr_size(auth.uid());
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_ocr_size(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_ocr_size() TO authenticated;
