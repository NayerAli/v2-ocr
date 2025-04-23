// Script to migrate base64 images to storage
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with hardcoded values from .env.local
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
);

async function migrateBase64ImagesToStorage() {
  console.log('Starting migration of base64 images to storage_path...');
  
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
  
  console.log(`Found ${results.length} results to migrate`);
  
  let migrated = 0;
  let failed = 0;
  
  for (const result of results) {
    try {
      console.log(`Processing result ${result.id}...`);
      
      // Extract the base64 data
      const base64Data = result.image_url.split(',')[1];
      if (!base64Data) {
        console.error(`[FAIL] Invalid base64 data for result ${result.id}`);
        failed++;
        continue;
      }
      
      // Convert base64 to Buffer
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Generate storage path
      const path = `${result.user_id}/${result.document_id}/migrated_${result.page_number || 1}.jpg`;
      console.log(`Uploading to storage path: ${path}`);
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('ocr-documents')
        .upload(path, buffer, { 
          contentType: 'image/jpeg',
          upsert: true 
        });
      
      if (uploadError) {
        console.error(`[FAIL] Upload error for result ${result.id}:`, uploadError);
        failed++;
        continue;
      }
      
      // Update the database record with the storage_path
      const { error: updateError } = await supabase
        .from('ocr_results')
        .update({ storage_path: path })
        .eq('id', result.id);
      
      if (updateError) {
        console.error(`[FAIL] Database update error for result ${result.id}:`, updateError);
        failed++;
        continue;
      }
      
      console.log(`[SUCCESS] Migrated result ${result.id}`);
      migrated++;
    } catch (err) {
      console.error(`[FAIL] Exception for result ${result.id}:`, err);
      failed++;
    }
  }
  
  console.log('\n--- Migration Summary ---');
  console.log(`Total eligible records: ${results.length}`);
  console.log(`Successfully migrated: ${migrated}`);
  console.log(`Failed: ${failed}`);
  console.log('Migration complete.');
}

migrateBase64ImagesToStorage();
