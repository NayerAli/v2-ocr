// CommonJS version of the migration script
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with hardcoded values from .env.local
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
);

async function dryRunMigrateBase64ImageToStorage() {
  console.log('Starting DRY RUN migration of a base64 image to storage_path...');
  const { data: results, error } = await supabase
    .from('ocr_results')
    .select('*');

  if (error) {
    console.error('Error fetching OCR results:', error);
    process.exit(1);
  }

  const testResult = results.find(r => !r.storage_path && r.image_url && r.image_url.startsWith('data:image/'));

  if (!testResult) {
    console.log('No eligible test row found (no base64 image_url without storage_path).');
    process.exit(0);
  }

  try {
    // Convert base64 to Buffer (Node.js)
    const base64 = testResult.image_url.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const path = `${testResult.user_id}/${testResult.document_id}/migrated_${testResult.page_number || 1}.jpg`;

    console.log('--- DRY RUN ---');
    console.log(`Would upload buffer of size: ${buffer.length} bytes to storage path: ${path}`);
    console.log('Would update ocr_results row id:', testResult.id, 'with storage_path:', path);
    console.log('No data was changed. This was a dry run.');
    process.exit(0);
  } catch (err) {
    console.error('[FAIL] Exception during dry run:', err);
    process.exit(1);
  }
}

dryRunMigrateBase64ImageToStorage();
