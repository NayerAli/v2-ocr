// Direct document processing script
// Run with: node scripts/direct-process-document.mjs <document-id>

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';

// Setup paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// Get credentials from .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OCR_API_KEY = process.env.OCR_API_KEY;

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Maximum timeout in seconds
const MAX_TIMEOUT_SECONDS = 60;

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convert image to base64
function imageToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

async function directProcessDocument(documentId) {
  if (!documentId) {
    console.error('❌ Document ID is required. Usage: node scripts/direct-process-document.mjs <document-id>');
    process.exit(1);
  }

  console.log(`🔄 DIRECT PROCESSING DOCUMENT: ${documentId}`);
  console.log(`⏱️ Maximum timeout: ${MAX_TIMEOUT_SECONDS} seconds`);
  console.log('=======================================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  if (!OCR_API_KEY) {
    console.error('❌ OCR API key not found in .env.local');
    process.exit(1);
  }

  console.log('Using Supabase URL:', SUPABASE_URL);

  try {
    // Step 1: Create Supabase client and authenticate
    console.log('\n🔐 STEP 1: Authenticating...');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
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

    // Step 2: Get document details
    console.log('\n🔍 STEP 2: Getting document details...');
    
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (documentError) {
      console.error('❌ Document not found:', documentError);
      process.exit(1);
    }
    
    console.log('✅ Document found');
    console.log('📄 Document details:');
    console.log(`  ID: ${document.id}`);
    console.log(`  Filename: ${document.filename}`);
    console.log(`  Status: ${document.status}`);
    console.log(`  Storage path: ${document.storage_path}`);

    // Step 3: Update document status to processing
    console.log('\n🔄 STEP 3: Updating document status to processing...');
    
    const processingStartedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'processing',
        processing_started_at: processingStartedAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    if (updateError) {
      console.error('❌ Failed to update document status:', updateError);
      process.exit(1);
    }
    
    console.log('✅ Document status updated to processing');

    // Step 4: Download the file from storage
    console.log('\n📥 STEP 4: Downloading file from storage...');
    
    const { data: fileData, error: fileError } = await supabase.storage
      .from('ocr-documents')
      .download(document.storage_path);
    
    if (fileError) {
      console.error('❌ Failed to download file:', fileError);
      
      // Update document status to error
      await supabase
        .from('documents')
        .update({
          status: 'error',
          error: `Failed to download file: ${fileError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
      
      process.exit(1);
    }
    
    console.log('✅ File downloaded successfully');
    console.log(`📊 File size: ${fileData.size} bytes`);

    // Step 5: Process the file with OCR
    console.log('\n🔍 STEP 5: Processing file with OCR...');
    
    // Convert file to base64
    const fileBuffer = await fileData.arrayBuffer();
    const base64Data = imageToBase64(Buffer.from(fileBuffer));
    console.log(`📊 Base64 data length: ${base64Data.length} characters`);
    
    // Process with Mistral OCR API
    const startTime = Date.now();
    let ocrResult;
    
    try {
      console.log('🤖 Sending request to Mistral OCR API...');
      const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OCR_API_KEY}`
        },
        body: JSON.stringify({
          model: 'mistral-ocr-latest',
          document: {
            type: 'image_url',
            image_url: `data:image/jpeg;base64,${base64Data}`
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Mistral OCR API error:', errorData);
        
        // Update document status to error
        await supabase
          .from('documents')
          .update({
            status: 'error',
            error: `Mistral OCR API error: ${JSON.stringify(errorData)}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);
        
        process.exit(1);
      }
      
      const data = await response.json();
      const processingTime = Date.now() - startTime;
      
      console.log('✅ Mistral OCR processing successful');
      console.log(`⏱️ Processing time: ${processingTime}ms`);
      
      // Extract text from Mistral OCR response
      let extractedText = '';
      
      if (data && data.text) {
        extractedText = data.text;
      } else if (data && data.pages && data.pages.length > 0) {
        extractedText = data.pages.map(page => {
          if (page.markdown) {
            // Remove image references like ![img-0.jpeg](img-0.jpeg)
            const cleanedText = page.markdown
              .replace(/!\[.*?\]\(.*?\)/g, '') // Remove image references
              .replace(/\$\$([\s\S]*?)\$\$/g, '$1') // Keep math content but remove $$ delimiters
              .replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, '$1') // Keep aligned content but remove delimiters
              .trim();
            return cleanedText;
          }
          return page.text || '';
        }).join('\n\n');
      }
      
      console.log(`📝 Extracted text (first 100 chars): ${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}`);
      
      // Generate a signed URL for the image
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('ocr-documents')
        .createSignedUrl(document.storage_path, 86400); // 24 hours
      
      if (signedUrlError) {
        console.warn('⚠️ Could not generate signed URL:', signedUrlError);
      }
      
      // Create OCR result object
      ocrResult = {
        id: randomUUID(),
        document_id: documentId,
        user_id: document.user_id,
        text: extractedText,
        confidence: 1, // Mistral doesn't provide confidence scores
        language: 'en',
        processing_time: processingTime,
        page_number: 1,
        total_pages: 1,
        storage_path: document.storage_path,
        image_url: signedUrlData?.signedUrl,
        provider: 'mistral'
      };
    } catch (ocrError) {
      console.error('❌ Error processing with OCR:', ocrError);
      
      // Update document status to error
      await supabase
        .from('documents')
        .update({
          status: 'error',
          error: `OCR processing error: ${ocrError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
      
      process.exit(1);
    }

    // Step 6: Save OCR result to database
    console.log('\n💾 STEP 6: Saving OCR result to database...');
    
    const { data: savedResult, error: saveError } = await supabase
      .from('ocr_results')
      .insert(ocrResult)
      .select()
      .single();
    
    if (saveError) {
      console.error('❌ Failed to save OCR result:', saveError);
      
      // Update document status to error
      await supabase
        .from('documents')
        .update({
          status: 'error',
          error: `Failed to save OCR result: ${saveError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
      
      process.exit(1);
    }
    
    console.log('✅ OCR result saved successfully');
    console.log('📄 OCR Result ID:', savedResult.id);

    // Step 7: Update document status to completed
    console.log('\n📝 STEP 7: Updating document status to completed...');
    
    const processingCompletedAt = new Date().toISOString();
    const { error: completeError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        processing_completed_at: processingCompletedAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    if (completeError) {
      console.error('❌ Failed to update document status:', completeError);
      process.exit(1);
    }
    
    console.log('✅ Document status updated to completed');
    
    console.log('\n✨ PROCESSING COMPLETED ✨');
    console.log(`Document ID: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
    process.exit(1);
  }
}

// Get document ID from command line arguments
const documentId = process.argv[2];
directProcessDocument(documentId);
