-- Create a function to get the total file size from the documents table
CREATE OR REPLACE FUNCTION public.get_total_file_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(file_size), 0)::bigint
  FROM public.documents;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_file_size() TO authenticated;
