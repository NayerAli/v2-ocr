#!/bin/bash

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting iNoor OCR setup...${NC}"

# Create directories
echo -e "${YELLOW}Creating required directories...${NC}"
mkdir -p volumes
mkdir -p supabase/migrations

# Create Kong configuration
echo -e "${YELLOW}Creating Kong configuration...${NC}"
cat > volumes/kong.yml << 'EOL'
_format_version: "2.1"
_transform: true

services:
  - name: auth-v1
    url: http://auth:9999/verify
    routes:
      - name: auth-v1-route
        paths:
          - /auth/v1/verify
  - name: auth-v1-admin
    url: http://auth:9999/admin
    routes:
      - name: auth-v1-admin-route
        paths:
          - /auth/v1/admin
  - name: auth-v1-token
    url: http://auth:9999
    routes:
      - name: auth-v1-token-route
        paths:
          - /auth/v1
  - name: rest-v1
    url: http://rest:3000
    routes:
      - name: rest-v1-route
        paths:
          - /rest/v1
  - name: storage-v1
    url: http://storage:5000
    routes:
      - name: storage-v1-route
        paths:
          - /storage/v1
EOL

# Create environment file example if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env << 'EOL'
############
# Secrets - CHANGE THESE BEFORE PRODUCTION!
############

# Generate a strong password for Postgres
POSTGRES_PASSWORD=change_me_to_a_strong_password

# Generate a strong JWT secret (at least 32 characters)
JWT_SECRET=change_me_to_a_strong_jwt_secret_at_least_32_chars

# Supabase keys (pre-generated examples, should be changed)
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q

# OCR API settings - Add your API keys here
AZURE_API_KEY=your_azure_api_key_here
AZURE_ENDPOINT=your_azure_endpoint_here

# Development mode settings
NODE_ENV=production

# Other required Supabase settings
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=strong_admin_password
SECRET_KEY_BASE=generate_a_long_random_string_here
VAULT_ENC_KEY=generate_a_32_char_min_encryption_key
EOL
    echo -e "${GREEN}Created .env file. Please update it with your actual values.${NC}"
else
    echo -e "${YELLOW}.env file already exists. Skipping creation.${NC}"
fi

# Create database migration files
echo -e "${YELLOW}Creating database migration files...${NC}"

cat > supabase/migrations/20255025_create_documents_table.sql << 'EOL'
-- Create necessary extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT,
  file_type TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  storage_path TEXT,
  error TEXT,
  current_page INTEGER,
  total_pages INTEGER,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own documents" 
  ON public.documents FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents" 
  ON public.documents FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" 
  ON public.documents FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" 
  ON public.documents FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_modified_column();

-- Grant privileges to authenticated users
GRANT ALL ON public.documents TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.documents_id_seq TO authenticated;
EOL

cat > supabase/migrations/20255026_create_ocr_results_table.sql << 'EOL'
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
EOL

cat > supabase/migrations/20255027_create_user_settings_table.sql << 'EOL'
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
EOL

# Make the setup script executable
chmod +x setup.sh

echo -e "${GREEN}Setup completed successfully!${NC}"
echo -e "${YELLOW}To start the application, run:${NC}"
echo -e "${GREEN}docker-compose up -d${NC}" 