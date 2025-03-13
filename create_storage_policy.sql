-- Create a policy to allow public access to the storage bucket
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ocr-documents');

-- Create a policy to allow public uploads (no authentication required)
CREATE POLICY "Public Can Upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'ocr-documents');

-- Create a policy to allow public updates
CREATE POLICY "Public Can Update Files" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'ocr-documents');

-- Create a policy to allow public deletions
CREATE POLICY "Public Can Delete Files" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'ocr-documents'); 