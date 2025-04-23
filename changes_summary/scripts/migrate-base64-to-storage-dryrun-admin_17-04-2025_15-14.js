// Script to perform a dry run migration of base64 images to storage using service role key
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
);

async function dryRunMigrateBase64ImageToStorage() {
  console.log('Starting DRY RUN migration of base64 images to storage_path...');
  
  // Get all results without storage_path but with base64 image_url
  const { data: results, error } = await supabase
    .from('ocr_results')
    .select('*')
    .is('storage_path', null)
    .like('image_url', 'data:image/%');
  
  if (error) {
    console.error('Error fetching OCR results:', error);
    process.exit(1);
  }
  
  console.log(`Found ${results.length} results eligible for migration`);
  
  if (results.length === 0) {
    console.log('No eligible records found. Nothing to migrate.');
    process.exit(0);
  }
  
  // Process each result (dry run only)
  for (let i = 0; i < Math.min(results.length, 5); i++) {
    const result = results[i];
    try {
      // Extract the base64 data
      const base64 = result.image_url.split(',')[1];
      if (!base64) {
        console.log(`[SKIP] Invalid base64 data for result ${result.id}`);
        continue;
      }
      
      // Calculate buffer size
      const bufferSize = Math.ceil(base64.length * 0.75); // Approximate size after base64 decoding
      
      // Generate storage path
      const path = `${result.user_id}/${result.document_id}/migrated_${result.page_number || 1}.jpg`;
      
      console.log(`\n--- DRY RUN for record ${i+1} ---`);
      console.log(`Result ID: ${result.id}`);
      console.log(`Document ID: ${result.document_id}`);
      console.log(`User ID: ${result.user_id}`);
      console.log(`Would upload approximately ${bufferSize} bytes to storage path: ${path}`);
      console.log(`Would update ocr_results row with storage_path: ${path}`);
    } catch (err) {
      console.error(`[ERROR] Exception processing result ${result.id}:`, err);
    }
  }
  
  console.log('\n--- DRY RUN SUMMARY ---');
  console.log(`Total records that would be migrated: ${results.length}`);
  console.log('No data was changed. This was a dry run.');
  
  // Check if the storage bucket exists
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  
  if (bucketsError) {
    console.error('Error listing storage buckets:', bucketsError);
  } else {
    const ocrDocumentsBucket = buckets.find(b => b.name === 'ocr-documents');
    if (!ocrDocumentsBucket) {
      console.log('\nWARNING: The "ocr-documents" bucket does not exist. You need to create it before running the actual migration.');
    } else {
      console.log('\nThe "ocr-documents" bucket exists and is ready for migration.');
    }
  }
}

dryRunMigrateBase64ImageToStorage();
