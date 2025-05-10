#!/usr/bin/env node

/**
 * Test script to verify document processing API
 * This script tests the document processing flow with the fixes for:
 * 1. RLS violations when saving OCR results
 * 2. Document lookup failures
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Setup paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TEST_EMAIL = 'test@test.com';
const TEST_PASSWORD = 'test12345';
const TEST_IMAGE_PATH = process.argv[2] || path.resolve(__dirname, '145.jpg');

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

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('🔍 Starting document processing API test script');
    console.log(`🔧 Using Supabase URL: ${SUPABASE_URL}`);

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

    // Step 5: Set cookies for authentication
    console.log('🍪 Setting cookies for authentication');

    try {
      // First, call the set-cookies endpoint to set authentication cookies
      const setCookiesResponse = await fetch('http://localhost:3000/api/auth/set-cookies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}`
        },
        body: JSON.stringify({
          event: 'SIGNED_IN',
          session: {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            user: authData.user
          }
        })
      });

      if (!setCookiesResponse.ok) {
        const errorData = await setCookiesResponse.json();
        console.error('❌ Failed to set cookies:', errorData);
        process.exit(1);
      }

      console.log('✅ Authentication cookies set successfully');

      // Now call the document processing API
      console.log('🔄 Calling document processing API');

      const processResponse = await fetch('http://localhost:3000/api/documents/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}`,
          'Cookie': setCookiesResponse.headers.get('set-cookie')
        },
        body: JSON.stringify({ documentId })
      });

      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        console.error('❌ Failed to process document via API:', errorData);
        process.exit(1);
      }

      const processResult = await processResponse.json();
      console.log('✅ Document processing initiated successfully');
      console.log('📊 Response:', processResult);
    } catch (apiError) {
      console.error('❌ Error calling API:', apiError);
      process.exit(1);
    }

    // Step 6: Wait for processing to complete
    console.log('⏳ Waiting for processing to complete...');
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (!isCompleted && attempts < maxAttempts) {
      attempts++;

      // Check document status
      const { data: document, error: checkError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (checkError) {
        console.error('❌ Error checking document status:', checkError);
        break;
      }

      console.log(`🔄 Document status: ${document.status} (attempt ${attempts}/${maxAttempts})`);

      if (document.status === 'completed') {
        isCompleted = true;
        console.log('✅ Document processing completed successfully');
      } else if (document.status === 'failed' || document.status === 'error') {
        console.error('❌ Document processing failed:', document.error);
        break;
      } else {
        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!isCompleted) {
      console.error('⚠️ Document processing timed out or failed');
    }

    // Step 7: Check OCR results
    console.log('🔍 Checking OCR results');
    const { data: results, error: resultsError } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', documentId);

    if (resultsError) {
      console.error('❌ Error fetching OCR results:', resultsError);
      process.exit(1);
    }

    if (!results || results.length === 0) {
      console.error('❌ No OCR results found for document');
      process.exit(1);
    }

    console.log(`✅ Found ${results.length} OCR results`);

    // Check for image_url field
    const hasImageUrl = results.some(result => result.image_url);
    console.log(`🔍 Results have image_url field: ${hasImageUrl ? 'Yes' : 'No'}`);

    // Print summary
    console.log('\n📋 Test Summary:');
    console.log(`Document ID: ${documentId}`);
    console.log(`Results Count: ${results.length}`);
    console.log(`Processing Status: ${isCompleted ? 'Completed' : 'Incomplete'}`);
    console.log(`Image URL Field Present: ${hasImageUrl ? 'Yes' : 'No'}`);

    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
