// Script to process a specific document
// Run with: node scripts/process-document.mjs <document-id>

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Setup paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// Get credentials from .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processDocument(documentId) {
  console.log(`🔄 PROCESSING DOCUMENT: ${documentId}`);
  console.log('===============================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  if (!documentId) {
    console.error('❌ Document ID is required. Usage: node scripts/process-document.mjs <document-id>');
    process.exit(1);
  }

  console.log('Using Supabase URL:', SUPABASE_URL);

  try {
    // Step 1: Create Supabase client and authenticate
    console.log('\n🔐 STEP 1: Authenticating...');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (authError) {
      console.error('❌ Authentication failed:', authError);
      process.exit(1);
    }
    
    console.log('✅ Authentication successful');
    console.log(`👤 User ID: ${authData.user.id}`);

    // Step 2: Check if document exists
    console.log('\n🔍 STEP 2: Checking document...');
    
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', authData.user.id)
      .single();
    
    if (documentError) {
      console.error('❌ Document not found or access denied:', documentError);
      process.exit(1);
    }
    
    console.log('✅ Document found');
    console.log('📄 Document details:');
    console.log(`  ID: ${document.id}`);
    console.log(`  Filename: ${document.filename}`);
    console.log(`  Status: ${document.status}`);
    console.log(`  Storage path: ${document.storage_path}`);

    // Step 3: Trigger document processing using API
    console.log('\n🚀 STEP 3: Triggering document processing...');
    
    try {
      // Try the /api/documents/process endpoint
      const processResponse = await fetch(`http://localhost:3000/api/documents/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}`
        },
        body: JSON.stringify({ documentId })
      });
      
      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        console.error('❌ Failed to trigger processing via API:', errorData);
        throw new Error('API processing failed');
      }
      
      const processResult = await processResponse.json();
      console.log('✅ Processing triggered successfully via API');
      console.log('📊 Response:', processResult);
    } catch (apiError) {
      console.error('❌ Error calling API:', apiError.message);
      
      // Fallback: Update document status directly
      console.log('⚠️ Falling back to direct database update...');
      
      const { data: updateData, error: updateError } = await supabase
        .from('documents')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId)
        .select();
      
      if (updateError) {
        console.error('❌ Failed to update document status:', updateError);
        process.exit(1);
      }
      
      console.log('✅ Document status updated to processing');
    }

    // Step 4: Poll for document status
    console.log('\n🔄 STEP 4: Polling for document status...');
    
    let isProcessingComplete = false;
    let attempts = 0;
    const maxAttempts = 30;  // Poll for up to 5 minutes
    
    while (!isProcessingComplete && attempts < maxAttempts) {
      attempts++;
      
      const { data: updatedDoc, error: statusError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (statusError) {
        console.error(`❌ Failed to get document status (attempt ${attempts}):`, statusError);
      } else {
        console.log(`📊 Document status (attempt ${attempts}): ${updatedDoc.status}`);
        
        if (updatedDoc.status === 'completed') {
          isProcessingComplete = true;
          console.log('✅ Document processing completed successfully');
        } else if (updatedDoc.status === 'error') {
          console.error('❌ Document processing failed with error:', updatedDoc.error);
          isProcessingComplete = true;
        }
      }
      
      if (!isProcessingComplete) {
        console.log(`⏳ Waiting 10 seconds before next status check...`);
        await sleep(10000);  // Wait 10 seconds between checks
      }
    }
    
    if (!isProcessingComplete) {
      console.error('❌ Document processing timed out after', maxAttempts, 'attempts');
    }
    
    // Step 5: Get OCR results
    console.log('\n📝 STEP 5: Getting OCR results...');
    
    const { data: ocrResults, error: ocrError } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', documentId);
    
    if (ocrError) {
      console.error('❌ Failed to get OCR results:', ocrError);
    } else if (!ocrResults || ocrResults.length === 0) {
      console.error('❌ No OCR results found for document');
    } else {
      console.log('✅ Found', ocrResults.length, 'OCR results');
      
      // Display OCR results
      ocrResults.forEach((result, index) => {
        console.log(`\n--- OCR Result ${index + 1} ---`);
        console.log(`ID: ${result.id}`);
        console.log(`Page: ${result.page_number} of ${result.total_pages}`);
        console.log(`Provider: ${result.provider || 'Unknown'}`);
        console.log(`Processing Time: ${result.processing_time}ms`);
        console.log(`Confidence: ${result.confidence}`);
        console.log(`Storage Path: ${result.storage_path}`);
        console.log(`Image URL: ${result.image_url ? result.image_url.substring(0, 50) + '...' : 'None'}`);
        console.log(`Text Preview: ${result.text ? result.text.substring(0, 100) + (result.text.length > 100 ? '...' : '') : 'No text'}`);
      });
    }
    
    console.log('\n✨ PROCESSING COMPLETED ✨');
    console.log(`Document ID: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
    process.exit(1);
  }
}

// Get document ID from command line arguments
const documentId = process.argv[2];
processDocument(documentId);
