// Test script for Supabase authentication and document access
// Run with: node scripts/test-auth-document-access.js

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

// Get credentials from .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Supabase credentials not found in .env.local');
  process.exit(1);
}

console.log('🔑 Using Supabase URL:', SUPABASE_URL);

async function runTests() {
  console.log('\n📋 RUNNING AUTHENTICATION AND DOCUMENT ACCESS TESTS');
  console.log('====================================================\n');
  
  try {
    // STEP 1: Authenticate
    console.log('🔐 STEP 1: Testing authentication...');
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
    
    // STEP 2: Fetch list of documents
    console.log('\n📚 STEP 2: Fetching documents...');
    const documentsResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=*`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const documents = await documentsResponse.json();
    
    if (!documentsResponse.ok) {
      console.error('❌ Failed to fetch documents:', documents);
      process.exit(1);
    }
    
    if (documents.length === 0) {
      console.log('⚠️ No documents found for this user');
    } else {
      console.log(`✅ Found ${documents.length} documents`);
      
      // Display document info
      documents.slice(0, 3).forEach((doc, i) => {
        console.log(`\n📄 Document ${i + 1}:`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Filename: ${doc.filename}`);
        console.log(`   Status: ${doc.status}`);
        console.log(`   Created: ${doc.created_at}`);
      });
      
      if (documents.length > 3) {
        console.log(`   ... and ${documents.length - 3} more documents`);
      }
      
      // STEP 3: Fetch a specific document
      if (documents.length > 0) {
        const docId = documents[0].id;
        console.log(`\n🔍 STEP 3: Fetching specific document (ID: ${docId})...`);
        
        const docResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${docId}&select=*`, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        const docData = await docResponse.json();
        
        if (!docResponse.ok || !docData.length) {
          console.error('❌ Failed to fetch specific document:', docData);
        } else {
          console.log('✅ Successfully fetched specific document');
          
          // STEP 4: Fetch OCR results for the document
          console.log('\n📑 STEP 4: Fetching OCR results...');
          
          const ocrResponse = await fetch(`${SUPABASE_URL}/rest/v1/ocr_results?document_id=eq.${docId}&select=*`, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          const ocrData = await ocrResponse.json();
          
          if (!ocrResponse.ok) {
            console.error('❌ Failed to fetch OCR results:', ocrData);
          } else if (ocrData.length === 0) {
            console.log('⚠️ No OCR results found for this document');
          } else {
            console.log(`✅ Found ${ocrData.length} OCR results (pages) for document`);
            console.log(`   First page text sample: "${ocrData[0].text.substring(0, 50)}..."`);
          }
        }
      }
    }
    
    console.log('\n✨ ALL TESTS COMPLETED ✨\n');
    
  } catch (error) {
    console.error('❌ Error during tests:', error);
    process.exit(1);
  }
}

runTests(); 