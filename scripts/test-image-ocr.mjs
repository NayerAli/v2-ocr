// Simple test script for image OCR processing
// Run with: node scripts/test-image-ocr.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

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

// Test image path - use the provided image path
const TEST_IMAGE_PATH = path.resolve(__dirname, '145.jpg');

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🧪 TESTING IMAGE OCR PROCESSING');
  console.log('===============================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  console.log('Using Supabase URL:', SUPABASE_URL);

  try {
    // Check if test image exists
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.error(`❌ Test image not found at ${TEST_IMAGE_PATH}`);
      process.exit(1);
    }
    console.log(`✅ Found test image at ${TEST_IMAGE_PATH}`);

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

    // Step 2: Upload the test image
    console.log('\n📤 STEP 2: Uploading test image...');
    
    // Generate a unique ID for the document
    const documentId = randomUUID();
    const fileName = path.basename(TEST_IMAGE_PATH);
    const fileType = path.extname(TEST_IMAGE_PATH).toLowerCase();
    const storagePath = `${authData.user.id}/${documentId}/Image_${documentId}${fileType}`;
    
    // Read the test file
    const fileBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    
    // Upload to Supabase storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('ocr-documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (storageError) {
      console.error('❌ Failed to upload image to storage:', storageError);
      process.exit(1);
    }
    
    console.log('✅ Image uploaded to storage successfully');
    console.log('📄 Storage path:', storagePath);
    
    // Create document record in database
    const documentData = {
      id: documentId,
      user_id: authData.user.id,
      filename: fileName,
      original_filename: fileName,
      file_type: 'image/jpeg',
      file_size: fileBuffer.length,
      storage_path: storagePath,
      status: 'queued'  // Set to queued to trigger processing
    };
    
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();
    
    if (documentError) {
      console.error('❌ Failed to create document record:', documentError);
      process.exit(1);
    }
    
    console.log('✅ Document record created successfully');
    console.log('📄 Document ID:', documentId);
    
    // Step 3: Poll for document status
    console.log('\n🔍 STEP 3: Polling for document status...');
    
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
    
    // Step 4: Get OCR results
    console.log('\n📝 STEP 4: Getting OCR results...');
    
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
    
    console.log('\n✨ TEST COMPLETED ✨');
    console.log(`Document ID for testing: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);
    
  } catch (error) {
    console.error('❌ Error during tests:', error);
    process.exit(1);
  }
}

runTest();
