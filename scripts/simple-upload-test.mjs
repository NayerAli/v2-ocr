// Simple upload test with direct OCR result creation
// Run with: node scripts/simple-upload-test.mjs

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

// Test image path
const TEST_IMAGE_PATH = path.resolve(__dirname, '145.jpg');

async function simpleUploadTest() {
  console.log('🧪 SIMPLE UPLOAD TEST');
  console.log('====================\n');

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

    // Step 3: Generate a signed URL for the image
    console.log('\n🔗 STEP 3: Generating signed URL for the image...');
    
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('ocr-documents')
      .createSignedUrl(storagePath, 86400); // 24 hours
    
    if (signedUrlError) {
      console.error('❌ Failed to generate signed URL:', signedUrlError);
      process.exit(1);
    }
    
    console.log('✅ Signed URL generated successfully');
    console.log('🔗 Signed URL:', signedUrlData.signedUrl.substring(0, 50) + '...');

    // Step 4: Create OCR result directly
    console.log('\n📝 STEP 4: Creating OCR result directly...');
    
    const ocrResultData = {
      id: randomUUID(),
      document_id: documentId,
      user_id: authData.user.id,
      text: 'This is a test OCR result for image 145.jpg. The OCR processing was simulated.',
      confidence: 0.95,
      language: 'en',
      processing_time: 500,  // 500ms simulated processing time
      page_number: 1,
      total_pages: 1,
      storage_path: storagePath,
      image_url: signedUrlData.signedUrl,
      provider: 'test'
    };
    
    const { data: ocrResult, error: ocrError } = await supabase
      .from('ocr_results')
      .insert(ocrResultData)
      .select()
      .single();
    
    if (ocrError) {
      console.error('❌ Failed to create OCR result:', ocrError);
      process.exit(1);
    }
    
    console.log('✅ OCR result created successfully');
    console.log('📄 OCR Result ID:', ocrResult.id);

    // Step 5: Update document status to completed
    console.log('\n📝 STEP 5: Updating document status...');
    
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Failed to update document status:', updateError);
      process.exit(1);
    }
    
    console.log('✅ Document status updated to completed');
    
    console.log('\n✨ TEST COMPLETED ✨');
    console.log(`Document ID: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);
    
  } catch (error) {
    console.error('❌ Error during test:', error);
    process.exit(1);
  }
}

simpleUploadTest();
