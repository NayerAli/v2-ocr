// Script to check the structure of the storage bucket
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
);

async function checkStorageStructure() {
  console.log('Checking storage bucket structure...');
  
  // List top-level folders
  const { data: topLevel, error: topError } = await supabase.storage
    .from('ocr-documents')
    .list();
  
  if (topError) {
    console.error('Error listing top-level folders:', topError);
    return;
  }
  
  console.log(`Found ${topLevel.length} top-level folders/files:`);
  for (const item of topLevel) {
    console.log(`- ${item.name} (${item.id})`);
    
    // If it's a folder, list its contents
    if (!item.metadata) {
      const { data: subItems, error: subError } = await supabase.storage
        .from('ocr-documents')
        .list(item.name);
      
      if (subError) {
        console.error(`Error listing contents of ${item.name}:`, subError);
        continue;
      }
      
      console.log(`  Found ${subItems.length} items in ${item.name}:`);
      for (let i = 0; i < Math.min(subItems.length, 5); i++) {
        const subItem = subItems[i];
        console.log(`  - ${subItem.name} (${subItem.id})`);
        
        // If it's a folder, list its contents
        if (!subItem.metadata) {
          const { data: files, error: filesError } = await supabase.storage
            .from('ocr-documents')
            .list(`${item.name}/${subItem.name}`);
          
          if (filesError) {
            console.error(`Error listing contents of ${item.name}/${subItem.name}:`, filesError);
            continue;
          }
          
          console.log(`    Found ${files.length} files in ${item.name}/${subItem.name}:`);
          for (let j = 0; j < Math.min(files.length, 3); j++) {
            console.log(`    - ${files[j].name}`);
          }
          if (files.length > 3) {
            console.log(`    ... and ${files.length - 3} more files`);
          }
        }
      }
      if (subItems.length > 5) {
        console.log(`  ... and ${subItems.length - 5} more items`);
      }
    }
  }
  
  // Check database records
  console.log('\nChecking database records...');
  
  // Count records with storage_path
  const { count: totalCount, error: countError } = await supabase
    .from('ocr_results')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error('Error counting records:', countError);
    return;
  }
  
  const { count: withStoragePath, error: pathCountError } = await supabase
    .from('ocr_results')
    .select('*', { count: 'exact', head: true })
    .not('storage_path', 'is', null);
  
  if (pathCountError) {
    console.error('Error counting records with storage_path:', pathCountError);
    return;
  }
  
  console.log(`Total records: ${totalCount}`);
  console.log(`Records with storage_path: ${withStoragePath}`);
  
  // Check for records with invalid storage paths
  const { data: sampleRecords, error: sampleError } = await supabase
    .from('ocr_results')
    .select('id, document_id, user_id, storage_path')
    .not('storage_path', 'is', null)
    .limit(20);
  
  if (sampleError) {
    console.error('Error fetching sample records:', sampleError);
    return;
  }
  
  console.log('\nSample records with storage_path:');
  for (const record of sampleRecords) {
    console.log(`- ID: ${record.id}, Path: ${record.storage_path}`);
  }
}

checkStorageStructure();
