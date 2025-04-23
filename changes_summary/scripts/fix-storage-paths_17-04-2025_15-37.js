// Script to fix incorrect storage paths in the database
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(
  'http://localhost:8000',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
);

async function fixStoragePaths() {
  console.log('Fixing incorrect storage paths...');
  
  // Get all records with storage_path that doesn't include a folder structure
  const { data: incorrectPaths, error } = await supabase
    .from('ocr_results')
    .select('id, document_id, user_id, storage_path, page_number, file_type')
    .not('storage_path', 'is', null)
    .not('storage_path', 'ilike', '%/%'); // Paths without a slash are incorrect
  
  if (error) {
    console.error('Error fetching records with incorrect paths:', error);
    process.exit(1);
  }
  
  console.log(`Found ${incorrectPaths.length} records with incorrect storage paths`);
  
  // Group by document_id to handle all pages of a document together
  const documentGroups = {};
  for (const record of incorrectPaths) {
    if (!documentGroups[record.document_id]) {
      documentGroups[record.document_id] = [];
    }
    documentGroups[record.document_id].push(record);
  }
  
  console.log(`Found ${Object.keys(documentGroups).length} documents to fix`);
  
  // Process each document
  for (const [documentId, records] of Object.entries(documentGroups)) {
    const userId = records[0].user_id;
    console.log(`\nProcessing document ${documentId} for user ${userId}`);
    
    // Check if the document exists in storage
    const { data: files, error: listError } = await supabase.storage
      .from('ocr-documents')
      .list(`${userId}/${documentId}`);
    
    if (listError) {
      console.log(`Document folder doesn't exist yet for ${documentId}`);
      
      // For each record, we need to:
      // 1. Get the base64 data from the record
      // 2. Upload it to storage with the correct path
      // 3. Update the record with the new storage path
      
      for (const record of records) {
        // Get the base64 data
        const { data: resultData, error: resultError } = await supabase
          .from('ocr_results')
          .select('base64_image')
          .eq('id', record.id)
          .single();
        
        if (resultError || !resultData.base64_image) {
          console.error(`Error getting base64 data for record ${record.id}:`, resultError);
          continue;
        }
        
        // Determine file extension
        let fileExtension = 'jpg'; // Default
        if (record.file_type) {
          if (record.file_type.includes('pdf')) {
            fileExtension = 'pdf';
          } else if (record.file_type.includes('png')) {
            fileExtension = 'png';
          } else if (record.file_type.includes('jpeg') || record.file_type.includes('jpg')) {
            fileExtension = 'jpg';
          }
        }
        
        // Determine page number
        const pageNumber = record.page_number || 1;
        
        // Create the correct storage path
        const correctPath = `${userId}/${documentId}/migrated_${pageNumber}.${fileExtension}`;
        
        // Convert base64 to buffer
        const base64Data = resultData.base64_image.replace(/^data:image\\/(png|jpeg|jpg);base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('ocr-documents')
          .upload(correctPath, buffer, {
            contentType: record.file_type || 'image/jpeg',
            upsert: true
          });
        
        if (uploadError) {
          console.error(`Error uploading file for record ${record.id}:`, uploadError);
          continue;
        }
        
        console.log(`Uploaded file to ${correctPath}`);
        
        // Update the record with the new storage path
        const { data: updateData, error: updateError } = await supabase
          .from('ocr_results')
          .update({ storage_path: correctPath })
          .eq('id', record.id);
        
        if (updateError) {
          console.error(`Error updating record ${record.id}:`, updateError);
          continue;
        }
        
        console.log(`Updated record ${record.id} with new storage path: ${correctPath}`);
      }
    } else {
      console.log(`Document folder exists for ${documentId}, updating paths...`);
      
      // The folder exists, so we just need to update the paths
      for (const record of records) {
        // Determine file extension
        let fileExtension = 'jpg'; // Default
        if (record.file_type) {
          if (record.file_type.includes('pdf')) {
            fileExtension = 'pdf';
          } else if (record.file_type.includes('png')) {
            fileExtension = 'png';
          } else if (record.file_type.includes('jpeg') || record.file_type.includes('jpg')) {
            fileExtension = 'jpg';
          }
        }
        
        // Determine page number
        const pageNumber = record.page_number || 1;
        
        // Create the correct storage path
        const correctPath = `${userId}/${documentId}/migrated_${pageNumber}.${fileExtension}`;
        
        // Check if the file exists
        try {
          const { data, error: checkError } = await supabase.storage
            .from('ocr-documents')
            .download(correctPath);
          
          if (checkError) {
            console.log(`File doesn't exist at ${correctPath}, skipping record ${record.id}`);
            continue;
          }
          
          // Update the record with the new storage path
          const { data: updateData, error: updateError } = await supabase
            .from('ocr_results')
            .update({ storage_path: correctPath })
            .eq('id', record.id);
          
          if (updateError) {
            console.error(`Error updating record ${record.id}:`, updateError);
            continue;
          }
          
          console.log(`Updated record ${record.id} with new storage path: ${correctPath}`);
        } catch (err) {
          console.error(`Error checking file existence for ${correctPath}:`, err);
        }
      }
    }
  }
  
  console.log('\nFinished fixing storage paths');
}

fixStoragePaths();
