// ESM test script for document upload and viewing
// Run with: node scripts/test-document-upload.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

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

async function runTests() {
  console.log('🧪 TESTING DOCUMENT UPLOAD AND VIEWING');
  console.log('======================================\n');
  
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
    
    // Step 2: Upload a test document
    console.log('\n📤 STEP 2: Uploading test document...');
    
    // First, check if the /api/documents/upload endpoint exists
    console.log('   2.1 Testing if /api/documents/upload endpoint exists...');
    const uploadEndpointTestResponse = await fetch('http://localhost:3000/api/documents/upload', {
      method: 'OPTIONS',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (uploadEndpointTestResponse.status === 404) {
      console.log('   ⚠️ /api/documents/upload endpoint not found, trying direct Supabase upload...');
      
      // Upload directly to Supabase storage
      console.log('   2.2 Uploading file directly to Supabase storage...');
      
      // Generate a unique ID for the document
      const documentId = crypto.randomUUID();
      const fileName = 'test-file.pdf';
      const storagePath = `uploads/${documentId}/${fileName}`;
      
      // Read the test file
      const fileBuffer = fs.readFileSync(TEST_FILE_PATH);
      
      // Upload to Supabase storage
      const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/ocr-documents/${storagePath}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true'
        },
        body: fileBuffer
      });
      
      const storageData = await storageResponse.json();
      
      if (!storageResponse.ok) {
        console.error('   ❌ Failed to upload file to storage:', storageData);
        process.exit(1);
      }
      
      console.log('   ✅ File uploaded to storage successfully');
      
      // Create document record in database
      console.log('   2.3 Creating document record in database...');
      
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
      
      const documentResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(documentData)
      });
      
      const documentResult = await documentResponse.json();
      
      if (!documentResponse.ok) {
        console.error('   ❌ Failed to create document record:', documentResult);
        // Log the exact error message and document data for debugging
        console.error('   Document data sent:', JSON.stringify(documentData, null, 2));
        console.error('   Error details:', documentResult.message || documentResult.error || 'Unknown error');
        process.exit(1);
      }
      
      console.log('   ✅ Document record created successfully');
      console.log(`   📄 Document ID: ${documentId}`);
      
      // Step 3: Check document status
      console.log('\n🔍 STEP 3: Checking document status...');
      
      const statusResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${documentId}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const statusData = await statusResponse.json();
      
      if (!statusResponse.ok || !statusData.length) {
        console.error('   ❌ Failed to get document status:', statusData);
        process.exit(1);
      }
      
      console.log('   ✅ Document status retrieved successfully');
      console.log(`   📊 Status: ${statusData[0].status}`);
      
      // Step 4: Test document viewing
      console.log('\n🖥️ STEP 4: Testing document viewing...');
      
      // Test the document page
      console.log(`   4.1 Testing document page at /documents/${documentId}...`);
      
      const pageResponse = await fetch(`http://localhost:3000/documents/${documentId}`, {
        method: 'GET',
        headers: {
          'Cookie': `sb-access-token=${accessToken}`
        }
      });
      
      // Check if the page exists
      if (pageResponse.status === 404) {
        console.error('   ❌ Document page not found');
      } else {
        console.log('   ✅ Document page exists');
        
        // Get the page content
        const pageContent = await pageResponse.text();
        
        // Check if the page contains expected content
        if (pageContent.includes('No preview available') || pageContent.includes('No text extracted')) {
          console.log('   ⚠️ Document page shows "No preview available" or "No text extracted"');
        }
        
        if (pageContent.includes('Document loading error')) {
          console.error('   ❌ Document page shows loading error');
          
          // Try to extract the error message
          const errorMatch = pageContent.match(/Document loading error: (.*?)"/);
          if (errorMatch && errorMatch[1]) {
            console.error(`   Error message: ${errorMatch[1]}`);
          }
        }
      }
      
      // Test the API endpoint for document data
      console.log(`   4.2 Testing API endpoint at /api/documents/${documentId}...`);
      
      const apiResponse = await fetch(`http://localhost:3000/api/documents/${documentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (apiResponse.status === 404) {
        console.error('   ❌ API endpoint not found');
      } else {
        const apiData = await apiResponse.json();
        
        if (!apiResponse.ok) {
          console.error('   ❌ API request failed:', apiData);
        } else {
          console.log('   ✅ API request successful');
          console.log(`   📄 Document data: ${JSON.stringify(apiData, null, 2)}`);
        }
      }
      
      // Step 5: Test the set-cookies endpoint
      console.log('\n🍪 STEP 5: Testing /api/auth/set-cookies endpoint...');
      
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
        console.error('   ❌ /api/auth/set-cookies endpoint not found');
        console.log('   This endpoint is required for proper authentication. Create it at app/api/auth/set-cookies/route.ts');
      } else {
        const setCookiesData = await setCookiesResponse.json();
        
        if (!setCookiesResponse.ok) {
          console.error('   ❌ /api/auth/set-cookies request failed:', setCookiesData);
        } else {
          console.log('   ✅ /api/auth/set-cookies request successful');
          console.log(`   🍪 Response: ${JSON.stringify(setCookiesData, null, 2)}`);
        }
      }
      
      console.log('\n✨ TEST COMPLETED ✨');
      console.log('Check the results above to identify and fix any issues.');
      
    } else {
      // Use the API endpoint for upload
      console.log('   ✅ /api/documents/upload endpoint exists, using it for upload...');
      
      // Create form data with the test file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(TEST_FILE_PATH), {
        filename: 'test-file.pdf',
        contentType: 'application/pdf'
      });
      
      // Upload the file
      const uploadResponse = await fetch('http://localhost:3000/api/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...formData.getHeaders()
        },
        body: formData
      });
      
      const uploadData = await uploadResponse.json();
      
      if (!uploadResponse.ok) {
        console.error('   ❌ Upload failed:', uploadData);
        process.exit(1);
      }
      
      console.log('   ✅ Upload successful');
      console.log(`   📄 Document ID: ${uploadData.document?.id || 'Unknown'}`);
      
      // Continue with steps 3-5 as in the direct upload path
      // (Code would be similar to the above)
    }
    
  } catch (error) {
    console.error('❌ Error during tests:', error);
    process.exit(1);
  }
}

runTests();
