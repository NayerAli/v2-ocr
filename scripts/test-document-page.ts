// TypeScript test for document viewer page (app/documents/[id]/page.tsx)
// Run with: npx ts-node scripts/test-document-page.ts

import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Get Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Test credentials
const TEST_EMAIL = 'test@test.com';
const TEST_PASSWORD = 'test12345';

// Document types from your project
interface OCRResult {
  id: string;
  document_id: string;
  pageNumber: number;
  text: string;
  language?: string;
  imageUrl?: string;
  storagePath?: string;
}

interface ProcessingStatus {
  id: string;
  status: string;
  filename: string;
  currentPage?: number;
  fileType?: string;
}

async function testDocumentPage() {
  console.log('🧪 TESTING DOCUMENT VIEWER PAGE FUNCTIONALITY');
  console.log('=============================================\n');
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }
  
  try {
    // Step 1: Login
    console.log('🔑 Step 1: Authenticating with Supabase...');
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
    
    const authData = await authResponse.json() as any;
    
    if (!authResponse.ok) {
      console.error('❌ Authentication failed:', authData);
      process.exit(1);
    }
    
    const accessToken = authData.access_token;
    const userId = authData.user.id;
    console.log(`✅ Authenticated as user ${userId}`);
    
    // Create the Supabase client (similar to what createClient() does)
    const supabase = {
      from: (table: string) => ({
        select: (query: string) => ({
          eq: (column: string, value: string | number) => ({
            single: async () => {
              const url = `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}&select=${query || '*'}`;
              const response = await fetch(url, {
                headers: {
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (!response.ok) {
                const error = await response.json();
                return { data: null, error };
              }
              
              const results = await response.json() as any[];
              return { data: results[0] || null, error: null };
            }
          })
        })
      })
    };
    
    // Step 2: Get list of documents
    console.log('\n📑 Step 2: Fetching documents...');
    const docsResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=*&order=created_at.desc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!docsResponse.ok) {
      console.error('❌ Failed to fetch documents');
      process.exit(1);
    }
    
    const documents = await docsResponse.json() as any[];
    
    if (!documents.length) {
      console.log('⚠️ No documents found for testing');
      process.exit(0);
    }
    
    console.log(`✅ Found ${documents.length} documents`);
    
    // Step 3: Test document viewer page with first document
    const testDocId = documents[0].id;
    console.log(`\n🖥️ Step 3: Testing document viewer with document ID: ${testDocId}`);
    
    // Simulating the document page component's data fetching
    console.log('\n3.1 Loading document data...');
    const docResponse = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${testDocId}&select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!docResponse.ok) {
      console.error('❌ Failed to fetch document data');
      process.exit(1);
    }
    
    const docData = await docResponse.json() as any[];
    
    if (!docData.length) {
      console.error('❌ Document not found');
      process.exit(1);
    }
    
    const docStatus: ProcessingStatus = docData[0];
    console.log(`✅ Document found: "${docStatus.filename}" (Status: ${docStatus.status})`);
    
    // Step 4: Fetch OCR results
    console.log('\n3.2 Fetching OCR results...');
    const resultsResponse = await fetch(`${SUPABASE_URL}/rest/v1/ocr_results?document_id=eq.${testDocId}&select=*&order=page_number.asc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!resultsResponse.ok) {
      console.error('❌ Failed to fetch OCR results');
      process.exit(1);
    }
    
    const ocrResults = await resultsResponse.json() as OCRResult[];
    
    if (!ocrResults.length) {
      console.log('⚠️ No OCR results found for this document');
      process.exit(0);
    }
    
    console.log(`✅ Found ${ocrResults.length} OCR results (pages)`);
    
    // Step 5: Check image URLs
    console.log('\n3.3 Verifying image URLs...');
    let validUrls = 0;
    let missingUrls = 0;
    let expiredUrls = 0;
    
    for (const result of ocrResults.slice(0, 3)) { // Check first 3 pages only for speed
      const pageNum = result.pageNumber;
      
      if (!result.imageUrl) {
        missingUrls++;
        console.log(`⚠️ Page ${pageNum}: No image URL found`);
        continue;
      }
      
      try {
        // Try to fetch the image
        const imageResponse = await fetch(result.imageUrl, { method: 'HEAD' });
        
        if (imageResponse.ok) {
          validUrls++;
          console.log(`✅ Page ${pageNum}: Image URL valid`);
        } else if (imageResponse.status === 403 || imageResponse.status === 401) {
          expiredUrls++;
          console.log(`🕒 Page ${pageNum}: Image URL expired (status ${imageResponse.status})`);
        } else {
          missingUrls++;
          console.log(`❌ Page ${pageNum}: Image URL invalid (status ${imageResponse.status})`);
        }
      } catch (error: any) {
        missingUrls++;
        console.log(`❌ Page ${pageNum}: Error checking image URL: ${error.message}`);
      }
    }
    
    // Step 6: Analyze and display results
    console.log('\n📊 ANALYSIS SUMMARY');
    console.log('==================');
    console.log(`Document: ${docStatus.filename}`);
    console.log(`Status: ${docStatus.status}`);
    console.log(`Total pages: ${ocrResults.length}`);
    console.log(`Image URLs: ${validUrls} valid, ${expiredUrls} expired, ${missingUrls} invalid/missing`);
    
    if (expiredUrls > 0) {
      console.log('\n⚠️ ISSUE FOUND: Some image URLs have expired');
      console.log('This is normal after a period of time with signed URLs.');
      console.log('The document viewer has a refreshSignedUrl function that will refresh these URLs when needed.');
      console.log('This explains why your documents might be visible in the database but not loading properly in the UI.');
    }
    
    if (validUrls === 0 && expiredUrls > 0) {
      console.log('\n🔄 RECOMMENDATION:');
      console.log('The image viewer may not be able to load images because the signed URLs have expired.');
      console.log('To fix this issue:');
      console.log('1. Ensure your refreshSignedUrl function in page.tsx is working correctly');
      console.log('2. Make sure the Supabase storage bucket permissions allow authenticated users to view images');
      console.log('3. Check that the dynamic import of @/lib/database/utils in refreshSignedUrl is working properly');
      console.log('4. Consider implementing an automatic URL refresh mechanism if URLs expire frequently');
    } else if (missingUrls > 0) {
      console.log('\n🔄 RECOMMENDATION:');
      console.log('Some pages have missing or invalid image URLs. Check your OCR processing pipeline.');
    }
    
    if (validUrls > 0) {
      console.log('\n✅ Your document viewer has access to valid images and should work correctly!');
    }
    
  } catch (error: any) {
    console.error('\n❌ Error executing test:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

testDocumentPage(); 