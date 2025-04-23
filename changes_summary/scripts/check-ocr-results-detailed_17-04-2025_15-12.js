// Script to check the current state of the ocr_results table in detail
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with hardcoded values from .env.local
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
);

async function checkOcrResultsDetailed() {
  console.log('Checking OCR results table in detail...');
  
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
  for (let i = 0; i < Math.min(results.length, 10); i++) {
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

checkOcrResultsDetailed();
