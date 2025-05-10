// ESM test script for document upload and viewing - Version 2
// Run with: node scripts/test-document-upload-v2.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Test file path - replace with a real test file in your project
const TEST_FILE_PATH = path.resolve(__dirname, 'test-file.pdf');

// Create a test file if it doesn't exist
function createTestFile() {
  if (!fs.existsSync(TEST_FILE_PATH)) {
    console.log('Creating test PDF file...');
    // Create a simple PDF-like file (not a real PDF, just for testing)
    fs.writeFileSync(TEST_FILE_PATH, '%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    console.log(`Created test file at ${TEST_FILE_PATH}`);
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

// Create Supabase admin client
function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

async function runTests() {
  console.log('🧪 TESTING DOCUMENT UPLOAD AND VIEWING - V2');
  console.log('==========================================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  console.log('Using Supabase URL:', SUPABASE_URL);

  try {
    // Create test file
    createTestFile();

    // Step 1: Authenticate
    console.log('\n🔐 STEP 1: Authenticating...');
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      console.error('❌ Authentication failed:', authData);
      process.exit(1);
    }

    console.log('✅ Authentication successful');
    console.log(`👤 User ID: ${authData.user.id}`);

    const accessToken = authData.access_token;

    // Create Supabase client with the access token
    const supabase = createSupabaseClient(accessToken);

    // Step 2: Upload a test document directly to Supabase
    console.log('\n📤 STEP 2: Uploading test document directly to Supabase...');

    // Generate a unique ID for the document
    const documentId = randomUUID();
    const fileName = 'test-file.pdf';
    const storagePath = `uploads/${documentId}/${fileName}`;

    // Read the test file
    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);

    // Upload to Supabase storage
    console.log('   2.1 Uploading file to Supabase storage...');
    const { data: storageData, error: storageError } = await supabase.storage
      .from('ocr-documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (storageError) {
      console.error('   ❌ Failed to upload file to storage:', storageError);
      process.exit(1);
    }

    console.log('   ✅ File uploaded to storage successfully');
    console.log('   📄 Storage path:', storagePath);

    // Create document record in database
    console.log('   2.2 Creating document record in database...');

    const documentData = {
      id: documentId,
      user_id: authData.user.id,
      filename: fileName,
      original_filename: fileName,
      file_type: 'application/pdf',
      file_size: fileBuffer.length,
      storage_path: storagePath,
      status: 'pending'
    };

    const { data: documentResult, error: documentError } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (documentError) {
      console.error('   ❌ Failed to create document record:', documentError);
      console.error('   Document data sent:', JSON.stringify(documentData, null, 2));
      process.exit(1);
    }

    console.log('   ✅ Document record created successfully');
    console.log(`   📄 Document ID: ${documentId}`);

    // Step 3: Create OCR results for testing
    console.log('\n🔍 STEP 3: Creating test OCR results...');

    // Create a test OCR result with all required fields based on the database schema
    const ocrResultData = {
      document_id: documentId,
      user_id: authData.user.id,
      page_number: 1,
      text: 'This is a test OCR result.',
      confidence: 0.95,
      language: 'en',
      processing_time: 0.5,  // Required field
      total_pages: 1,
      storage_path: storagePath,
      image_url: null,
      provider: 'test'  // Required field
    };

    // Use the authenticated user client instead of admin client
    // This ensures we're testing with proper user permissions

    const { data: ocrResult, error: ocrError } = await supabase
      .from('ocr_results')
      .insert(ocrResultData)
      .select()
      .single();

    if (ocrError) {
      console.error('   ❌ Failed to create OCR result:', ocrError);
      process.exit(1);
    }

    console.log('   ✅ OCR result created successfully');
    console.log(`   📄 OCR Result ID: ${ocrResult.id}`);

    // Step 4: Generate a signed URL for the document
    console.log('\n🔗 STEP 4: Generating signed URL for the document...');

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('ocr-documents')
      .createSignedUrl(storagePath, 86400);

    if (signedUrlError) {
      console.error('   ❌ Failed to generate signed URL:', signedUrlError);
    } else {
      console.log('   ✅ Signed URL generated successfully');
      console.log(`   🔗 Signed URL: ${signedUrlData.signedUrl}`);

      // Update the OCR result with the signed URL
      // Use the authenticated user client
      const { error: updateError } = await supabase
        .from('ocr_results')
        .update({ image_url: signedUrlData.signedUrl })  // Using snake_case as per database schema
        .eq('id', ocrResult.id);

      if (updateError) {
        console.error('   ❌ Failed to update OCR result with signed URL:', updateError);
      } else {
        console.log('   ✅ OCR result updated with signed URL');
      }
    }

    // Step 5: Update document status to 'completed'
    console.log('\n📋 STEP 5: Updating document status to completed...');

    // Use the authenticated user client
    const { error: statusError } = await supabase
      .from('documents')
      .update({ status: 'completed' })
      .eq('id', documentId);

    if (statusError) {
      console.error('   ❌ Failed to update document status:', statusError);
    } else {
      console.log('   ✅ Document status updated to completed');
    }

    // Step 6: Test document viewing
    console.log('\n🖥️ STEP 6: Testing document viewing...');
    console.log(`   Open this URL in your browser: http://localhost:3000/documents/${documentId}`);

    // Step 7: Test the set-cookies endpoint
    console.log('\n🍪 STEP 7: Testing /api/auth/set-cookies endpoint...');

    try {
      const setCookiesResponse = await fetch('http://localhost:3000/api/auth/set-cookies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          event: 'SIGNED_IN',
          session: {
            access_token: accessToken,
            user: authData.user
          }
        })
      });

      if (setCookiesResponse.status === 404) {
        console.error('   ❌ /api/auth/set-cookies endpoint not found (404)');
      } else {
        try {
          const setCookiesData = await setCookiesResponse.json();

          if (!setCookiesResponse.ok) {
            console.error(`   ❌ /api/auth/set-cookies request failed (${setCookiesResponse.status}):`, setCookiesData);
          } else {
            console.log('   ✅ /api/auth/set-cookies request successful');
            console.log(`   🍪 Response: ${JSON.stringify(setCookiesData, null, 2)}`);
          }
        } catch (e) {
          console.error(`   ❌ /api/auth/set-cookies returned invalid JSON (${setCookiesResponse.status})`);
          const text = await setCookiesResponse.text();
          console.error(`   Response text: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
        }
      }
    } catch (error) {
      console.error('   ❌ Error testing /api/auth/set-cookies endpoint:', error);
    }

    console.log('\n✨ TEST COMPLETED ✨');
    console.log(`Document ID for testing: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);
    console.log('Check the results above to identify and fix any issues.');

  } catch (error) {
    console.error('❌ Error during tests:', error);
    process.exit(1);
  }
}

runTests();
