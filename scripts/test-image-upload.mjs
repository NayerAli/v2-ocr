// ESM test script for image upload and OCR processing
// Run with: node scripts/test-image-upload.mjs

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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Test image path - use the provided image path
const TEST_IMAGE_PATH = path.resolve(__dirname, '145.jpg');

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

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 TESTING IMAGE UPLOAD AND OCR PROCESSING');
  console.log('==========================================\n');

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

    // Step 2: Upload the test image directly to Supabase
    console.log('\n📤 STEP 2: Uploading test image directly to Supabase...');

    // Generate a unique ID for the document
    const documentId = randomUUID();
    const fileName = path.basename(TEST_IMAGE_PATH);
    const fileType = path.extname(TEST_IMAGE_PATH).toLowerCase();
    const storagePath = `${authData.user.id}/${documentId}/Image_${documentId}${fileType}`;

    // Read the test file
    const fileBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    const fileSize = fileBuffer.length;

    // Upload to Supabase storage
    console.log('   2.1 Uploading image to Supabase storage...');
    const { data: storageData, error: storageError } = await supabase.storage
      .from('ocr-documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (storageError) {
      console.error('   ❌ Failed to upload image to storage:', storageError);
      process.exit(1);
    }

    console.log('   ✅ Image uploaded to storage successfully');
    console.log('   📄 Storage path:', storagePath);

    // Create document record in database
    console.log('   2.2 Creating document record in database...');

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

    // Step 3: Trigger document processing
    console.log('\n🔄 STEP 3: Triggering document processing...');
    
    const processingResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_document`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        document_id: documentId
      })
    });

    if (!processingResponse.ok) {
      try {
        const processingError = await processingResponse.json();
        console.error('   ❌ Failed to trigger document processing:', processingError);
      } catch (e) {
        console.error('   ❌ Failed to trigger document processing:', processingResponse.status, await processingResponse.text());
      }
      
      // Try alternative API endpoint
      console.log('   Trying alternative API endpoint...');
      
      const altProcessingResponse = await fetch(`http://localhost:3000/api/documents/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId: documentId
        })
      });
      
      if (!altProcessingResponse.ok) {
        try {
          const altError = await altProcessingResponse.json();
          console.error('   ❌ Failed to trigger document processing with alternative endpoint:', altError);
          process.exit(1);
        } catch (e) {
          console.error('   ❌ Failed to trigger document processing with alternative endpoint:', altProcessingResponse.status, await altProcessingResponse.text());
          process.exit(1);
        }
      } else {
        console.log('   ✅ Document processing triggered successfully with alternative endpoint');
      }
    } else {
      console.log('   ✅ Document processing triggered successfully');
    }

    // Step 4: Poll for document status
    console.log('\n🔍 STEP 4: Polling for document status...');
    
    let isProcessingComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 5 minutes (30 * 10 seconds)
    
    while (!isProcessingComplete && attempts < maxAttempts) {
      attempts++;
      
      const { data: document, error: statusError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (statusError) {
        console.error(`   ❌ Failed to get document status (attempt ${attempts}):`, statusError);
      } else {
        console.log(`   📊 Document status (attempt ${attempts}): ${document.status}`);
        
        if (document.status === 'completed') {
          isProcessingComplete = true;
          console.log('   ✅ Document processing completed successfully');
        } else if (document.status === 'error') {
          console.error('   ❌ Document processing failed with error:', document.error);
          isProcessingComplete = true;
        }
      }
      
      if (!isProcessingComplete) {
        console.log(`   ⏳ Waiting 10 seconds before next status check...`);
        await sleep(10000); // Wait 10 seconds between checks
      }
    }
    
    if (!isProcessingComplete) {
      console.error('   ❌ Document processing timed out after', maxAttempts, 'attempts');
    }

    // Step 5: Get OCR results
    console.log('\n📝 STEP 5: Getting OCR results...');
    
    const { data: ocrResults, error: ocrError } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true });
    
    if (ocrError) {
      console.error('   ❌ Failed to get OCR results:', ocrError);
    } else if (!ocrResults || ocrResults.length === 0) {
      console.error('   ❌ No OCR results found for document');
    } else {
      console.log('   ✅ Found', ocrResults.length, 'OCR results');
      
      // Display OCR results
      ocrResults.forEach((result, index) => {
        console.log(`\n   --- OCR Result ${index + 1} ---`);
        console.log(`   ID: ${result.id}`);
        console.log(`   Page: ${result.page_number} of ${result.total_pages}`);
        console.log(`   Provider: ${result.provider}`);
        console.log(`   Processing Time: ${result.processing_time}ms`);
        console.log(`   Confidence: ${result.confidence}`);
        console.log(`   Storage Path: ${result.storage_path}`);
        console.log(`   Image URL: ${result.image_url ? result.image_url.substring(0, 50) + '...' : 'None'}`);
        console.log(`   Text Preview: ${result.text ? result.text.substring(0, 100) + (result.text.length > 100 ? '...' : '') : 'No text'}`);
      });
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
