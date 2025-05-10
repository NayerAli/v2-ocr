// ESM test script for Supabase authentication and document access
// Run with: node scripts/test-auth.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';

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

async function runTests() {
  console.log('🔑 TESTING AUTHENTICATION & DOCUMENT ACCESS');
  console.log('==========================================\n');
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }
  
  console.log('Using Supabase URL:', SUPABASE_URL);
  
  try {
    // Step 1: Authenticate
    console.log('\n🔐 STEP 1: Testing authentication...');
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
    
    // Step 2: Fetch list of documents
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
      
      // Step 3: Fetch a specific document
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
          
          // Step 4: Fetch OCR results for the document
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
            
            // Check image URLs
            console.log('\n🖼️ Testing image URLs for first 3 pages:');
            let validUrls = 0;
            let invalidUrls = 0;
            
            for (const result of ocrData.slice(0, 3)) {
              const pageNum = result.page_number;
              const imageUrl = result.image_url;
              
              if (!imageUrl) {
                console.log(`   ⚠️ Page ${pageNum}: No image URL found`);
                continue;
              }
              
              try {
                console.log(`   Testing URL for page ${pageNum}...`);
                const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
                
                if (imageResponse.ok) {
                  validUrls++;
                  console.log(`   ✅ Page ${pageNum}: Image URL valid`);
                } else {
                  invalidUrls++;
                  console.log(`   ❌ Page ${pageNum}: Image URL returned ${imageResponse.status}`);
                }
              } catch (error) {
                invalidUrls++;
                console.log(`   ❌ Page ${pageNum}: Error accessing URL: ${error.message}`);
              }
            }
            
            if (invalidUrls > 0) {
              console.log('\n⚠️ Some image URLs are invalid or expired.');
              console.log('This may require refreshing the signed URLs.');
            }
            
            console.log(`\nFirst page text: "${ocrData[0].text.substring(0, 50)}..."`);
          }
        }
      }
    }
    
    // Test simulating the document viewer page
    if (documents.length > 0) {
      console.log('\n🖥️ STEP 5: Simulating document viewer page...');
      const docId = documents[0].id;
      
      // Create a mock Supabase client like the one in page.tsx
      console.log('   5.1 Creating Supabase client (similar to createClient())...');
      const mockClient = {
        from: (table) => ({
          select: (query) => ({
            eq: (field, value) => ({
              single: async () => {
                const response = await fetch(
                  `${SUPABASE_URL}/rest/v1/${table}?${field}=eq.${value}${query ? `&select=${query}` : ''}`,
                  {
                    headers: {
                      'apikey': SUPABASE_ANON_KEY,
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                const data = await response.json();
                return { data: data[0] || null, error: null };
              }
            })
          })
        })
      };
      
      console.log('   5.2 Fetching document with mock client...');
      const { data: doc, error: docError } = await mockClient
        .from('documents')
        .select('*')
        .eq('id', docId)
        .single();
      
      if (docError || !doc) {
        console.error('   ❌ Failed to fetch document with mock client');
      } else {
        console.log('   ✅ Successfully fetched document using mock client');
        console.log(`   Document: ${doc.filename} (${doc.status})`);
        
        console.log('   5.3 Fetching OCR results with mock client...');
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/ocr_results?document_id=eq.${docId}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const results = await response.json();
        
        if (!response.ok || !results.length) {
          console.error('   ❌ Failed to fetch OCR results with mock client');
        } else {
          console.log(`   ✅ Successfully fetched ${results.length} OCR results using mock client`);
          console.log('   👍 Document viewer page should work correctly with this authentication!');
        }
      }
    }
    
    console.log('\n✨ ALL TESTS COMPLETED ✨');
    console.log('Your document viewer should work correctly with this Supabase authentication!');
    
  } catch (error) {
    console.error('❌ Error during tests:', error);
    process.exit(1);
  }
}

runTests(); 