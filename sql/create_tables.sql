-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  current_page INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL,
  type TEXT NOT NULL,
  start_time BIGINT,
  end_time BIGINT,
  completion_time BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Results table
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER,
  image_url TEXT,
  text TEXT,
  confidence REAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for OCR documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('ocr-documents', 'ocr-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
INSERT INTO storage.policies (name, definition, bucket_id)
VALUES 
  ('Public Access', 
   '{"name":"Public Access","id":"ocr-documents-public-access","statement":"CREATE POLICY \"Public Access\" ON storage.objects FOR SELECT USING (bucket_id = ''ocr-documents'')","effect":"ALLOW"}', 
   'ocr-documents')
ON CONFLICT (name, bucket_id) DO NOTHING; 