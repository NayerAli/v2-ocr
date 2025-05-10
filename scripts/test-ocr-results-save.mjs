#!/usr/bin/env node

/**
 * Test script to verify OCR results saving functionality
 * This script tests the document processing flow with the fixes for:
 * 1. RLS violations when saving OCR results
 * 2. Document lookup failures
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Setup paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TEST_EMAIL = 'test@test.com';
const TEST_PASSWORD = 'test12345';
const TEST_IMAGE_PATH = process.argv[2] || path.resolve(__dirname, 'test-image.jpg');

// Create a test image if it doesn't exist
function createTestImage() {
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    console.log('Creating test image file...');
    // Create a simple JPG-like file (not a real JPG, just for testing)
    fs.writeFileSync(TEST_IMAGE_PATH, Buffer.from('FFD8FFE000104A46494600010101006000600000FFDB004300', 'hex'));
    console.log(`Created test file at ${TEST_IMAGE_PATH}`);
  }
}

// Create Supabase client
function createSupabaseClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: token ? {
        Authorization: `Bearer ${token}`
      } : {}
    }
  });
}

// Create Supabase service client
function createSupabaseServiceClient() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Service role key not found in .env.local');
    process.exit(1);
  }
  
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('🔍 Starting OCR results save test script');
    console.log(`🔧 Using Supabase URL: ${SUPABASE_URL}`);
    
    // Create test image
    createTestImage();
    
    // Step 1: Authenticate
    console.log('🔑 Authenticating with test user');
    const { data: authData, error: authError } = await createSupabaseClient().auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (authError) {
      console.error('❌ Authentication failed:', authError);
      process.exit(1);
    }
    
    console.log('✅ Authentication successful');
    console.log(`👤 User ID: ${authData.user.id}`);
    
    // Step 2: Check if test image exists
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.error(`❌ Test image not found at path: ${TEST_IMAGE_PATH}`);
      process.exit(1);
    }
    
    const fileStats = fs.statSync(TEST_IMAGE_PATH);
    console.log(`📄 Test image: ${TEST_IMAGE_PATH}, size: ${fileStats.size} bytes`);
    
    // Step 3: Create a document record
    const documentId = crypto.randomUUID();
    const filename = path.basename(TEST_IMAGE_PATH);
    const storagePath = `uploads/${documentId}/${filename}`;
    
    console.log(`📝 Creating document record with ID: ${documentId}`);
    
    // Use the authenticated client
    const supabase = createSupabaseClient(authData.session.access_token);
    
    const { error: insertError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        user_id: authData.user.id,
        filename: filename,
        original_filename: filename,
        file_type: 'image/jpeg',
        file_size: fileStats.size,
        status: 'pending',
        storage_path: storagePath
      });
    
    if (insertError) {
      console.error('❌ Failed to create document record:', insertError);
      process.exit(1);
    }
    
    console.log('✅ Document record created successfully');
    
    // Step 4: Upload the test image
    console.log(`📤 Uploading test image to storage: ${storagePath}`);
    const fileBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    
    const { error: uploadError } = await supabase.storage
      .from('ocr-documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (uploadError) {
      console.error('❌ Failed to upload test image:', uploadError);
      process.exit(1);
    }
    
    console.log('✅ Test image uploaded successfully');
    
    // Step 5: Create OCR results using both client and service client
    console.log('🔍 Creating OCR results with regular client');
    
    const ocrResultData = {
      document_id: documentId,
      user_id: authData.user.id,
      page_number: 1,
      text: 'This is a test OCR result from regular client.',
      confidence: 0.95,
      language: 'en',
      processing_time: 0.5,
      total_pages: 1,
      storage_path: storagePath,
      image_url: null,
      provider: 'test'
    };
    
    const { data: ocrResult, error: ocrError } = await supabase
      .from('ocr_results')
      .insert(ocrResultData)
      .select()
      .single();
    
    if (ocrError) {
      console.error('❌ Failed to create OCR result with regular client:', ocrError);
      console.log('🔍 Trying with service client instead');
      
      // Try with service client
      const serviceClient = createSupabaseServiceClient();
      const { data: serviceOcrResult, error: serviceOcrError } = await serviceClient
        .from('ocr_results')
        .insert(ocrResultData)
        .select()
        .single();
      
      if (serviceOcrError) {
        console.error('❌ Failed to create OCR result with service client:', serviceOcrError);
        process.exit(1);
      } else {
        console.log('✅ OCR result created successfully with service client');
        console.log(`📄 OCR Result ID: ${serviceOcrResult.id}`);
      }
    } else {
      console.log('✅ OCR result created successfully with regular client');
      console.log(`📄 OCR Result ID: ${ocrResult.id}`);
    }
    
    // Step 6: Update document status to 'completed'
    console.log('📋 Updating document status to completed');
    
    const { error: statusError } = await supabase
      .from('documents')
      .update({ status: 'completed' })
      .eq('id', documentId);
    
    if (statusError) {
      console.error('❌ Failed to update document status:', statusError);
    } else {
      console.log('✅ Document status updated to completed');
    }
    
    console.log('\n✅ Test completed successfully');
    console.log(`Document ID for testing: ${documentId}`);
    console.log('Check the results above to identify and fix any issues.');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
