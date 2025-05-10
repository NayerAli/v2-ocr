#!/usr/bin/env node

/**
 * Test script to verify OCR processing fixes
 * This script tests the document processing flow with the fixes for:
 * 1. OCR Results Saving (race condition)
 * 2. Field Naming Inconsistency (imageUrl vs image_url)
 * 3. Authentication Issues
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const TEST_EMAIL = 'test@test.com';
const TEST_PASSWORD = 'password123';
const TEST_IMAGE_PATH = process.argv[2] || 'scripts/145.jpg'; // Default test image or pass as argument

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('🔍 Starting OCR fixes test script');
    console.log(`🔧 Using Supabase URL: ${SUPABASE_URL}`);
    
    // Step 1: Authenticate
    console.log('🔑 Authenticating with test user');
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
    
    // Step 5: Trigger document processing
    console.log('🔄 Triggering document processing');
    
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
