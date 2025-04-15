-- Create a function to get the total file size for a specific user
CREATE OR REPLACE FUNCTION public.get_user_file_size(user_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(file_size), 0)::bigint
  FROM public.documents
  WHERE documents.user_id = get_user_file_size.user_id;
$$;

-- Create a function to get the total file size for the current user
CREATE OR REPLACE FUNCTION public.get_current_user_file_size()
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT public.get_user_file_size(auth.uid());
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_file_size(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_file_size() TO authenticated;
