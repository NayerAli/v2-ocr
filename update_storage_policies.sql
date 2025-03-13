-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated Users Can Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users Can Update Own Files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users Can Delete Own Files" ON storage.objects;

-- Create new public access policies
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ocr-documents');

CREATE POLICY "Public Can Upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'ocr-documents');

CREATE POLICY "Public Can Update Files" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'ocr-documents');

CREATE POLICY "Public Can Delete Files" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'ocr-documents'); 