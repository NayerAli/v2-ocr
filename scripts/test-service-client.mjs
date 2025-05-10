#!/usr/bin/env node

/**
 * Test script to verify service client for saving OCR results
 * This script tests the service client implementation for bypassing RLS
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
    console.log('🔍 Starting service client test script');
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
    
    // Step 2: Create a document record
    const documentId = crypto.randomUUID();
    const filename = 'test-file.jpg';
    
    console.log(`📝 Creating document record with ID: ${documentId}`);
    
    // Use the service client to bypass RLS
    const serviceClient = createSupabaseServiceClient();
    
    const { error: insertError } = await serviceClient
      .from('documents')
      .insert({
        id: documentId,
        user_id: authData.user.id,
        filename: filename,
        original_filename: filename,
        file_type: 'image/jpeg',
        file_size: 1000,
        status: 'completed',
        storage_path: `uploads/${documentId}/${filename}`
      });
    
    if (insertError) {
      console.error('❌ Failed to create document record:', insertError);
      process.exit(1);
    }
    
    console.log('✅ Document record created successfully');
    
    // Step 3: Create OCR results using service client
    console.log('🔍 Creating OCR results with service client');
    
    const ocrResultData = {
      document_id: documentId,
      user_id: authData.user.id,
      page_number: 1,
      text: 'This is a test OCR result from service client.',
      confidence: 0.95,
      language: 'en',
      processing_time: 0.5,
      total_pages: 1,
      storage_path: `uploads/${documentId}/${filename}`,
      image_url: null,
      provider: 'test'
    };
    
    const { data: ocrResult, error: ocrError } = await serviceClient
      .from('ocr_results')
      .insert(ocrResultData)
      .select()
      .single();
    
    if (ocrError) {
      console.error('❌ Failed to create OCR result with service client:', ocrError);
      process.exit(1);
    }
    
    console.log('✅ OCR result created successfully with service client');
    console.log(`📄 OCR Result ID: ${ocrResult.id}`);
    
    // Step 4: Try to create OCR results using regular client
    console.log('🔍 Creating OCR results with regular client');
    
    const regularClient = createSupabaseClient(authData.session.access_token);
    
    const ocrResultData2 = {
      ...ocrResultData,
      page_number: 2,
      text: 'This is a test OCR result from regular client.'
    };
    
    const { data: ocrResult2, error: ocrError2 } = await regularClient
      .from('ocr_results')
      .insert(ocrResultData2)
      .select()
      .single();
    
    if (ocrError2) {
      console.log('ℹ️ Regular client failed as expected due to RLS:', ocrError2.message);
    } else {
      console.log('✅ OCR result created successfully with regular client');
      console.log(`📄 OCR Result ID: ${ocrResult2.id}`);
    }
    
    // Step 5: Check OCR results
    console.log('🔍 Checking OCR results');
    const { data: results, error: resultsError } = await serviceClient
      .from('ocr_results')
      .select('*')
      .eq('document_id', documentId);
    
    if (resultsError) {
      console.error('❌ Error fetching OCR results:', resultsError);
      process.exit(1);
    }
    
    console.log(`✅ Found ${results.length} OCR results`);
    
    // Print summary
    console.log('\n📋 Test Summary:');
    console.log(`Document ID: ${documentId}`);
    console.log(`Results Count: ${results.length}`);
    console.log(`Service Client Success: Yes`);
    console.log(`Regular Client Success: ${ocrError2 ? 'No (Expected)' : 'Yes'}`);
    
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
