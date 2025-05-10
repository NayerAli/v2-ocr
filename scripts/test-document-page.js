// JavaScript test for document viewer page (app/documents/[id]/page.tsx)
// Run with: node scripts/test-document-page.js

require('dotenv').config({ path: '.env.local' });
// Use fetch properly in CommonJS
const nodeFetch = require('node-fetch');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Get Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Test credentials
const TEST_EMAIL = 'test@test.com'; // Replace if needed
const TEST_PASSWORD = 'test12345';  // Replace if needed

async function testDocumentPage() {
  console.log('🧪 TESTING DOCUMENT VIEWER PAGE FUNCTIONALITY');
  console.log('=============================================\n');
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }
  
  console.log('🔑 Using Supabase URL:', SUPABASE_URL);
  
  try {
    // Step 1: Login
    console.log('\n🔐 Step 1: Testing authentication...');
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
    
    // Step 2: Fetch specific document ID from first document in the list
    console.log('\n📚 Step 2: Finding a document to test...');
    const documentsResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=id,filename,status&order=created_at.desc&limit=1`, {
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
      process.exit(1);
    }
    
    const testDoc = documents[0];
    console.log(`✅ Found document: "${testDoc.filename}" (${testDoc.status})`);
    
    // Step 3: Test document page (similar to what happens in app/documents/[id]/page.tsx)
    const docId = testDoc.id;
    console.log(`\n🖥️ Step 3: Testing document viewer with document ID: ${docId}`);
    
    // Fetch document
    console.log('\n3.1 Fetching document...');
    const { data: doc, error: docError } = await fetchDoc(SUPABASE_URL, SUPABASE_ANON_KEY, accessToken, docId);
    
    if (docError || !doc) {
      console.error('❌ Document not found in the database:', docError || 'No data returned');
      process.exit(1);
    }
    
    console.log(`✅ Document fetched successfully: "${doc.filename}"`);
    console.log(`   Status: ${doc.status}`);
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`);
    
    // Fetch OCR results
    console.log('\n3.2 Fetching OCR results...');
    const { data: results, error: resultsError } = await fetchOcrResults(SUPABASE_URL, SUPABASE_ANON_KEY, accessToken, docId);
    
    if (resultsError) {
      console.error('❌ Error fetching OCR results:', resultsError);
      process.exit(1);
    }
    
    if (!results || results.length === 0) {
      console.log('⚠️ No OCR results found for this document');
    } else {
      console.log(`✅ Found ${results.length} OCR results (pages)`);
      
      // Test image URLs
      console.log('\n3.3 Testing image URLs...');
      let validUrls = 0;
      let invalidUrls = 0;
      let missingUrls = 0;
      
      // Only test the first 3 images to save time
      const testPages = results.slice(0, Math.min(3, results.length));
      
      for (const result of testPages) {
        console.log(`   Testing page ${result.page_number || result.pageNumber}...`);
        
        if (!result.image_url && !result.imageUrl) {
          console.log(`   ⚠️ No image URL for this page`);
          missingUrls++;
          continue;
        }
        
        const imageUrl = result.image_url || result.imageUrl;
        
        try {
          // Make a HEAD request to the image URL
          const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
          
          if (imageResponse.ok) {
            console.log(`   ✅ Image URL is valid`);
            validUrls++;
          } else {
            console.log(`   ❌ Image URL returned status ${imageResponse.status}`);
            invalidUrls++;
          }
        } catch (error) {
          console.log(`   ❌ Error accessing image URL: ${error.message}`);
          invalidUrls++;
        }
      }
      
      // Step 4: Analysis
      console.log('\n📊 ANALYSIS SUMMARY');
      console.log('==================');
      console.log(`Document: ${doc.filename}`);
      console.log(`Status: ${doc.status}`);
      console.log(`Total pages: ${results.length}`);
      console.log(`URLs tested: ${testPages.length}`);
      console.log(`URL results: ${validUrls} valid, ${invalidUrls} invalid, ${missingUrls} missing`);
      
      if (invalidUrls > 0) {
        console.log('\n⚠️ POSSIBLE ISSUE: Some image URLs are not accessible');
        console.log('This could be due to:');
        console.log('1. Expired signed URLs (normal after some time)');
        console.log('2. Storage bucket permissions issues');
        console.log('3. The images were deleted from storage');
        
        console.log('\n🔄 RECOMMENDATION:');
        console.log('1. Check your refreshSignedUrl function in page.tsx');
        console.log('2. Verify Supabase storage bucket permissions');
        console.log('3. Make sure the storagePath property is present for images');
      }
      
      if (missingUrls > 0) {
        console.log('\n⚠️ ISSUE: Some pages are missing image URLs');
        console.log('Check your OCR processing pipeline to ensure images are properly saved and URLs are generated.');
      }
      
      if (validUrls > 0) {
        console.log('\n✅ Good news! At least some images are accessible.');
        console.log('The document viewer should work correctly for these pages.');
      }
    }
    
    console.log('\n✨ TEST COMPLETED ✨');
    
  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Helper function to fetch a document (similar to what page.tsx does)
async function fetchDoc(supabaseUrl, apiKey, token, docId) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${docId}&select=*`, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return { data: null, error: `HTTP error ${response.status}` };
    }
    
    const data = await response.json();
    return { data: data[0] || null, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

// Helper function to fetch OCR results (similar to what page.tsx does)
async function fetchOcrResults(supabaseUrl, apiKey, token, docId) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/ocr_results?document_id=eq.${docId}&select=*&order=page_number.asc`, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return { data: null, error: `HTTP error ${response.status}` };
    }
    
    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

testDocumentPage(); 