// Simulate OCR processing without external API
// Run with: node scripts/simulate-ocr-processing.mjs <document-id>

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

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateOCRProcessing(documentId) {
  if (!documentId) {
    console.error('❌ Document ID is required. Usage: node scripts/simulate-ocr-processing.mjs <document-id>');
    process.exit(1);
  }

  console.log(`🔄 SIMULATING OCR PROCESSING: ${documentId}`);
  console.log('=======================================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
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

    // Step 4: Simulate OCR processing
    console.log('\n⏳ STEP 4: Simulating OCR processing...');
    console.log('Waiting 5 seconds to simulate processing time...');
    await sleep(5000);
    
    // Generate a signed URL for the image
    console.log('Generating signed URL for the image...');
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('ocr-documents')
      .createSignedUrl(document.storage_path, 86400); // 24 hours
    
    if (signedUrlError) {
      console.warn('⚠️ Could not generate signed URL:', signedUrlError);
    } else {
      console.log('✅ Signed URL generated successfully');
    }
    
    // Create simulated OCR result
    const simulatedText = `This is a simulated OCR result for document ${documentId}.
    
The image appears to contain text content that would normally be extracted by an OCR service.
    
This is a placeholder text that simulates what would be returned by a real OCR service like Mistral OCR.
    
Filename: ${document.filename}
Document ID: ${documentId}
Processing time: 5000ms (simulated)`;
    
    // Create OCR result object
    const ocrResult = {
      id: randomUUID(),
      document_id: documentId,
      user_id: document.user_id,
      text: simulatedText,
      confidence: 0.95,
      language: 'en',
      processing_time: 5000,
      page_number: 1,
      total_pages: 1,
      storage_path: document.storage_path,
      image_url: signedUrlData?.signedUrl,
      provider: 'simulated'
    };
    
    console.log('✅ OCR processing simulated successfully');

    // Step 5: Save OCR result to database
    console.log('\n💾 STEP 5: Saving OCR result to database...');
    
    const { data: savedResult, error: saveError } = await supabase
      .from('ocr_results')
      .insert(ocrResult)
      .select()
      .single();
    
    if (saveError) {
      console.error('❌ Failed to save OCR result:', saveError);
      process.exit(1);
    }
    
    console.log('✅ OCR result saved successfully');
    console.log('📄 OCR Result ID:', savedResult.id);

    // Step 6: Update document status to completed
    console.log('\n📝 STEP 6: Updating document status to completed...');
    
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
simulateOCRProcessing(documentId);
