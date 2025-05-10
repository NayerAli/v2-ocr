// Test script for Supabase authentication and document access
// Run with: node scripts/test-auth-document-access.mjs

import { createRequire } from 'module';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local file
config({ path: path.resolve(__dirname, '..', '.env.local') });

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
    
    // STEP 5: Test the document viewer page
    console.log('\n🖥️ STEP 5: Testing document viewer functionality...');
    console.log('   This simulates what happens in app/documents/[id]/page.tsx');
    
    if (documents.length > 0) {
      const docId = documents[0].id;
      
      // Fetch document metadata
      console.log('   Fetching document metadata...');
      const docDetailResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${docId}&select=*`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const docDetailData = await docDetailResponse.json();
      
      if (!docDetailResponse.ok || !docDetailData.length) {
        console.error('   ❌ Failed to fetch document metadata');
      } else {
        console.log('   ✅ Successfully fetched document metadata');
        
        // Fetch OCR results
        console.log('   Fetching OCR results...');
        const ocrDetailsResponse = await fetch(`${SUPABASE_URL}/rest/v1/ocr_results?document_id=eq.${docId}&select=*`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        const ocrDetailsData = await ocrDetailsResponse.json();
        
        if (!ocrDetailsResponse.ok) {
          console.error('   ❌ Failed to fetch OCR results');
        } else if (ocrDetailsData.length === 0) {
          console.log('   ⚠️ No OCR results found for this document');
        } else {
          console.log(`   ✅ Successfully fetched ${ocrDetailsData.length} OCR results`);
          
          // Check image URLs
          let validImageUrls = 0;
          let invalidImageUrls = 0;
          
          for (const result of ocrDetailsData) {
            if (result.imageUrl) {
              try {
                const imageResponse = await fetch(result.imageUrl, { method: 'HEAD' });
                if (imageResponse.ok) {
                  validImageUrls++;
                } else {
                  invalidImageUrls++;
                  console.log(`   ⚠️ Image URL for page ${result.pageNumber} returned status ${imageResponse.status}`);
                }
              } catch (error) {
                invalidImageUrls++;
                console.log(`   ⚠️ Failed to check image URL for page ${result.pageNumber}: ${error.message}`);
              }
            } else if (result.storagePath) {
              console.log(`   ℹ️ Page ${result.pageNumber} has storagePath but no imageUrl`);
            } else {
              console.log(`   ⚠️ Page ${result.pageNumber} has no imageUrl or storagePath`);
            }
          }
          
          console.log(`   📊 Image URL summary: ${validImageUrls} valid, ${invalidImageUrls} invalid`);
        }
      }
    } else {
      console.log('   ⚠️ No documents available to test viewer functionality');
    }
    
    console.log('\n✨ ALL TESTS COMPLETED ✨\n');
    
  } catch (error) {
    console.error('❌ Error during tests:', error);
    process.exit(1);
  }
}

runTests(); 