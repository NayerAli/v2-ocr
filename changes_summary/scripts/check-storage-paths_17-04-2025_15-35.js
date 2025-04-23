// Script to check the current state of storage paths in the database
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
);

async function checkStoragePaths() {
  console.log('Checking storage paths in the database...');
  
  // Get a sample of results with storage_path
  const { data: results, error } = await supabase
    .from('ocr_results')
    .select('*')
    .not('storage_path', 'is', null)
    .limit(10);
  
  if (error) {
    console.error('Error fetching OCR results:', error);
    process.exit(1);
  }
  
  console.log(`Found ${results.length} results with storage_path`);
  
  // Check each result
  for (const result of results) {
    console.log(`\nResult ID: ${result.id}`);
    console.log(`Document ID: ${result.document_id}`);
    console.log(`User ID: ${result.user_id}`);
    console.log(`Storage Path: ${result.storage_path}`);
    
    // Check if the file exists in storage
    try {
      const { data, error: storageError } = await supabase.storage
        .from('ocr-documents')
        .download(result.storage_path);
      
      if (storageError) {
        console.error(`File not found in storage: ${result.storage_path}`);
        console.error(storageError);
      } else {
        console.log(`File exists in storage: ${result.storage_path}`);
      }
    } catch (err) {
      console.error(`Error checking storage for ${result.storage_path}:`, err);
    }
  }
  
  // List files in the storage bucket
  console.log('\nListing files in the ocr-documents bucket:');
  const { data: files, error: listError } = await supabase.storage
    .from('ocr-documents')
    .list();
  
  if (listError) {
    console.error('Error listing files:', listError);
  } else {
    console.log(`Found ${files.length} files in the bucket`);
    files.slice(0, 10).forEach(file => {
      console.log(`- ${file.name}`);
    });
  }
}

checkStoragePaths();
