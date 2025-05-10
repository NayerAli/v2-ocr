// Test OCR processing with timeout
// Run with: node scripts/test-ocr-with-timeout.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';

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

// Test image path
const TEST_IMAGE_PATH = path.resolve(__dirname, '145.jpg');

// Maximum timeout in seconds
const MAX_TIMEOUT_SECONDS = 60;

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testOCRWithTimeout() {
  console.log('🧪 TESTING OCR PROCESSING WITH TIMEOUT');
  console.log(`⏱️ Maximum timeout: ${MAX_TIMEOUT_SECONDS} seconds`);
  console.log('=======================================\n');

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

    // Step 2: Upload image to storage
    console.log('\n📤 STEP 2: Uploading image to storage...');

    // Generate a unique ID for the document
    const documentId = randomUUID();
    const fileName = path.basename(TEST_IMAGE_PATH);
    const fileType = path.extname(TEST_IMAGE_PATH).toLowerCase();
    const storagePath = `${authData.user.id}/${documentId}/Image_${documentId}${fileType}`;

    // Read the image file
    const fileBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    const fileSize = fileBuffer.length;

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
      file_size: fileSize,
      storage_path: storagePath,
      status: 'pending'
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

    // Step 3: Trigger document processing
    console.log('\n🔄 STEP 3: Triggering document processing...');

    // Fallback: Update document status directly to queued
    console.log('Updating document status directly to queued...');

    const { data: updateData, error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'queued',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .select();

    if (updateError) {
      console.error('❌ Failed to update document status:', updateError);
      process.exit(1);
    }

    console.log('✅ Document status updated to queued');

    // Step 4: Poll for document status with timeout
    console.log('\n🔍 STEP 4: Polling for document status with timeout...');

    let isProcessingComplete = false;
    let attempts = 0;
    const startTime = Date.now();
    const timeoutMs = MAX_TIMEOUT_SECONDS * 1000;

    while (!isProcessingComplete && (Date.now() - startTime) < timeoutMs) {
      attempts++;

      const { data: updatedDoc, error: statusError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (statusError) {
        console.error(`❌ Failed to get document status (attempt ${attempts}):`, statusError);
      } else {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        console.log(`📊 Document status (attempt ${attempts}, ${elapsedSeconds}s elapsed): ${updatedDoc.status}`);

        if (updatedDoc.status === 'completed') {
          isProcessingComplete = true;
          console.log('✅ Document processing completed successfully');
        } else if (updatedDoc.status === 'error' || updatedDoc.status === 'failed') {
          console.error('❌ Document processing failed with error:', updatedDoc.error);
          isProcessingComplete = true;
        }
      }

      if (!isProcessingComplete) {
        // Calculate remaining time
        const elapsedMs = Date.now() - startTime;
        const remainingMs = timeoutMs - elapsedMs;

        if (remainingMs <= 0) {
          console.error('❌ Document processing timed out after', MAX_TIMEOUT_SECONDS, 'seconds');
          break;
        }

        // Wait 2 seconds between checks, but don't exceed the timeout
        const waitTime = Math.min(2000, remainingMs);
        console.log(`⏳ Waiting ${waitTime/1000}s before next status check (${Math.floor(remainingMs/1000)}s remaining)...`);
        await sleep(waitTime);
      }
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

    console.log('\n✨ TEST COMPLETED ✨');
    console.log(`Document ID: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);

  } catch (error) {
    console.error('❌ Error during test:', error);
    process.exit(1);
  }
}

testOCRWithTimeout();
