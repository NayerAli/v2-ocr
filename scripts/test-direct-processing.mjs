#!/usr/bin/env node

/**
 * Test script to directly process a document without using the API
 * This script tests the document processing flow with the fixes for:
 * 1. RLS violations when saving OCR results
 * 2. Document lookup failures
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

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

// Promisify exec
const execPromise = promisify(exec);

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('🔍 Starting direct document processing test script');
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
    
    const { error: uploadError } = await serviceClient.storage
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
    
    // Step 5: Create a script to directly process the document
    console.log('📝 Creating direct processing script');
    
    const scriptPath = path.resolve(__dirname, 'temp-process-script.mjs');
    const scriptContent = `
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = '${SUPABASE_URL}';
const SUPABASE_SERVICE_KEY = '${SUPABASE_SERVICE_KEY}';
const DOCUMENT_ID = '${documentId}';

// Create service client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function processDocument() {
  try {
    console.log('Processing document:', DOCUMENT_ID);
    
    // Update document status to 'queued'
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'queued',
        updated_at: new Date().toISOString()
      })
      .eq('id', DOCUMENT_ID);
    
    if (updateError) {
      console.error('Error updating document status:', updateError);
      process.exit(1);
    }
    
    console.log('Document status updated to queued');
    
    // Wait for processing to complete
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!isCompleted && attempts < maxAttempts) {
      attempts++;
      
      // Check document status
      const { data: document, error: checkError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', DOCUMENT_ID)
        .single();
      
      if (checkError) {
        console.error('Error checking document status:', checkError);
        break;
      }
      
      console.log('Document status:', document.status, '(attempt', attempts, '/', maxAttempts, ')');
      
      if (document.status === 'completed' || document.status === 'failed' || document.status === 'error') {
        isCompleted = true;
        console.log('Document processing completed with status:', document.status);
        
        // Check for OCR results
        const { data: results, error: resultsError } = await supabase
          .from('ocr_results')
          .select('*')
          .eq('document_id', DOCUMENT_ID);
        
        if (resultsError) {
          console.error('Error fetching OCR results:', resultsError);
        } else {
          console.log('Found', results.length, 'OCR results');
        }
      } else {
        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!isCompleted) {
      console.error('Document processing timed out');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

processDocument();
`;
    
    fs.writeFileSync(scriptPath, scriptContent);
    console.log('✅ Direct processing script created');
    
    // Step 6: Run the direct processing script
    console.log('🔄 Running direct processing script');
    
    try {
      const { stdout, stderr } = await execPromise(`node ${scriptPath}`);
      console.log('📋 Script output:');
      console.log(stdout);
      
      if (stderr) {
        console.error('❌ Script errors:');
        console.error(stderr);
      }
    } catch (execError) {
      console.error('❌ Error running script:', execError);
      if (execError.stdout) console.log(execError.stdout);
      if (execError.stderr) console.error(execError.stderr);
    }
    
    // Step 7: Clean up the temporary script
    fs.unlinkSync(scriptPath);
    console.log('🧹 Temporary script removed');
    
    // Step 8: Check OCR results
    console.log('🔍 Checking OCR results');
    const { data: results, error: resultsError } = await serviceClient
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
    
    // Print summary
    console.log('\n📋 Test Summary:');
    console.log(`Document ID: ${documentId}`);
    console.log(`Results Count: ${results.length}`);
    
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
