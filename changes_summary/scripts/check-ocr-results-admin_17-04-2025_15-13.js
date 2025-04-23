// Script to check the current state of the ocr_results table using service role key
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
);

async function checkOcrResultsAdmin() {
  console.log('Checking OCR results table with admin privileges...');
  
  // Get all results
  const { data: results, error } = await supabase
    .from('ocr_results')
    .select('*');
  
  if (error) {
    console.error('Error fetching OCR results:', error);
    process.exit(1);
  }
  
  console.log(`Total OCR results: ${results.length}`);
  
  // Analyze each record
  for (let i = 0; i < Math.min(results.length, 5); i++) {
    const result = results[i];
    console.log(`\nRecord ${i+1}:`);
    console.log(`ID: ${result.id}`);
    console.log(`Document ID: ${result.document_id}`);
    console.log(`User ID: ${result.user_id}`);
    console.log(`Page Number: ${result.page_number}`);
    
    // Check image_url
    if (result.image_url) {
      const isBase64 = result.image_url.startsWith('data:');
      console.log(`Image URL: ${result.image_url.substring(0, 30)}... (${isBase64 ? 'base64' : 'URL'})`);
    } else {
      console.log('Image URL: null');
    }
    
    // Check storage_path
    if (result.storage_path) {
      console.log(`Storage Path: ${result.storage_path}`);
    } else {
      console.log('Storage Path: null');
    }
  }
  
  // Count different categories
  const withBase64 = results.filter(r => r.image_url && r.image_url.startsWith('data:')).length;
  const withStoragePath = results.filter(r => r.storage_path).length;
  const withBoth = results.filter(r => r.storage_path && r.image_url && r.image_url.startsWith('data:')).length;
  const needsMigration = results.filter(r => !r.storage_path && r.image_url && r.image_url.startsWith('data:')).length;
  
  console.log('\n--- Summary ---');
  console.log(`Records with base64 image_url: ${withBase64}`);
  console.log(`Records with storage_path: ${withStoragePath}`);
  console.log(`Records with both: ${withBoth}`);
  console.log(`Records needing migration (base64 but no storage_path): ${needsMigration}`);
  
  // Check if the storage bucket exists
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  
  if (bucketsError) {
    console.error('Error listing storage buckets:', bucketsError);
  } else {
    console.log('\n--- Storage Buckets ---');
    buckets.forEach(bucket => {
      console.log(`- ${bucket.name}`);
    });
    
    const ocrDocumentsBucket = buckets.find(b => b.name === 'ocr-documents');
    if (!ocrDocumentsBucket) {
      console.log('\nWARNING: The "ocr-documents" bucket does not exist. You need to create it before migration.');
    }
  }
}

checkOcrResultsAdmin();
