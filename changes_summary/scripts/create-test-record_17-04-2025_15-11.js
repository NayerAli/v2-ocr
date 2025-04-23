// Script to create a test record with a base64 image
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Create Supabase client with hardcoded values from .env.local
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
);

// A small base64 encoded 1x1 pixel transparent PNG
const smallBase64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function createTestRecord() {
  console.log('Creating a test record with a base64 image...');

  // Use a hardcoded test user ID
  const userId = crypto.randomUUID();
  console.log(`Using test user ID: ${userId}`);


  // Create a test document
  const documentId = crypto.randomUUID();
  console.log(`Creating test document with ID: ${documentId}`);

  const { error: newDocumentError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: userId,
      filename: 'test-document.pdf',
      original_filename: 'test-document.pdf',
      file_size: 1024,
      file_type: 'application/pdf',
      storage_path: 'test-document.pdf',
      status: 'completed',
      total_pages: 1
    });

  if (newDocumentError) {
    console.error('Error creating test document:', newDocumentError);
    process.exit(1);
  }

  // Create a test OCR result with a base64 image
  const { data: newResult, error: newResultError } = await supabase
    .from('ocr_results')
    .insert({
      id: crypto.randomUUID(),
      document_id: documentId,
      user_id: userId,
      text: 'This is a test OCR result',
      confidence: 0.95,
      language: 'en',
      processing_time: 0.5,
      page_number: 1,
      total_pages: 1,
      image_url: smallBase64Image,
      provider: 'test'
    })
    .select();

  if (newResultError) {
    console.error('Error creating test OCR result:', newResultError);
    process.exit(1);
  }

  console.log(`Created test OCR result with ID: ${newResult[0].id}`);
  console.log('Test record created successfully!');
}

createTestRecord();
