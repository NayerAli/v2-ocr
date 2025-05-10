// Direct OCR processing script
// Run with: node scripts/direct-ocr-process.mjs <document-id>

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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Sleep function for polling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convert image to base64
function imageToBase64(filePath) {
  const fileData = fs.readFileSync(filePath);
  return Buffer.from(fileData).toString('base64');
}

async function directOCRProcess(documentId) {
  console.log(`🔄 DIRECT OCR PROCESSING: ${documentId}`);
  console.log('===============================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  if (!documentId) {
    console.error('❌ Document ID is required. Usage: node scripts/direct-ocr-process.mjs <document-id>');
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
      .eq('user_id', authData.user.id)
      .single();
    
    if (documentError) {
      console.error('❌ Document not found or access denied:', documentError);
      process.exit(1);
    }
    
    console.log('✅ Document found');
    console.log('📄 Document details:');
    console.log(`  ID: ${document.id}`);
    console.log(`  Filename: ${document.filename}`);
    console.log(`  Status: ${document.status}`);
    console.log(`  Storage path: ${document.storage_path}`);

    // Step 3: Download the image from storage
    console.log('\n📥 STEP 3: Downloading image from storage...');
    
    const { data: fileData, error: fileError } = await supabase.storage
      .from('ocr-documents')
      .download(document.storage_path);
    
    if (fileError) {
      console.error('❌ Failed to download image:', fileError);
      process.exit(1);
    }
    
    // Save the file temporarily
    const tempFilePath = path.join(__dirname, `temp_${documentId}.jpg`);
    fs.writeFileSync(tempFilePath, Buffer.from(await fileData.arrayBuffer()));
    
    console.log('✅ Image downloaded successfully');
    console.log('📄 Temporary file path:', tempFilePath);

    // Step 4: Convert image to base64
    console.log('\n🔄 STEP 4: Converting image to base64...');
    
    const base64Data = imageToBase64(tempFilePath);
    console.log('✅ Image converted to base64');
    console.log(`📊 Base64 data length: ${base64Data.length} characters`);

    // Step 5: Get OCR settings
    console.log('\n⚙️ STEP 5: Getting OCR settings...');
    
    // Try to get OCR settings from user settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('ocr_settings')
      .eq('user_id', authData.user.id)
      .single();
    
    let ocrSettings = {
      provider: 'mistral',
      apiKey: process.env.OCR_API_KEY || '',
      useSystemKey: true,
      language: 'en'
    };
    
    if (settingsError) {
      console.warn('⚠️ Could not get user OCR settings, using defaults:', settingsError);
    } else if (settings && settings.ocr_settings) {
      ocrSettings = settings.ocr_settings;
      console.log('✅ Got user OCR settings');
      console.log(`📊 Provider: ${ocrSettings.provider}`);
      console.log(`📊 Use system key: ${ocrSettings.useSystemKey}`);
    }

    // Step 6: Process image with OCR API directly
    console.log('\n🔍 STEP 6: Processing image with OCR API...');
    
    let ocrResult;
    
    if (ocrSettings.provider === 'mistral') {
      console.log('🤖 Using Mistral OCR API');
      
      // Use system key if configured
      const apiKey = ocrSettings.useSystemKey ? process.env.OCR_API_KEY : ocrSettings.apiKey;
      
      if (!apiKey) {
        console.error('❌ No API key available for Mistral OCR');
        process.exit(1);
      }
      
      // Process with Mistral OCR API
      const startTime = Date.now();
      
      try {
        const response = await fetch('https://api.mistral.ai/v1/ocr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
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
          throw new Error(`Mistral OCR API error: ${response.status}`);
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
        
        // Create OCR result object
        ocrResult = {
          id: randomUUID(),
          document_id: documentId,
          user_id: authData.user.id,
          text: extractedText,
          confidence: 1, // Mistral doesn't provide confidence scores
          language: ocrSettings.language || 'en',
          processing_time: processingTime,
          page_number: 1,
          total_pages: 1,
          storage_path: document.storage_path,
          provider: 'mistral'
        };
        
        // Generate a signed URL for the image
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('ocr-documents')
          .createSignedUrl(document.storage_path, 86400); // 24 hours
        
        if (!signedUrlError && signedUrlData) {
          ocrResult.image_url = signedUrlData.signedUrl;
          console.log('✅ Generated signed URL for image');
        } else {
          console.warn('⚠️ Could not generate signed URL:', signedUrlError);
        }
      } catch (ocrError) {
        console.error('❌ Error processing with Mistral OCR:', ocrError);
        process.exit(1);
      }
    } else {
      console.error(`❌ Unsupported OCR provider: ${ocrSettings.provider}`);
      process.exit(1);
    }

    // Step 7: Save OCR result to database
    console.log('\n💾 STEP 7: Saving OCR result to database...');
    
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

    // Step 8: Update document status to completed
    console.log('\n📝 STEP 8: Updating document status...');
    
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Failed to update document status:', updateError);
      process.exit(1);
    }
    
    console.log('✅ Document status updated to completed');

    // Step 9: Display OCR result
    console.log('\n📝 STEP 9: OCR Result...');
    console.log('--- OCR Result ---');
    console.log(`ID: ${savedResult.id}`);
    console.log(`Document ID: ${savedResult.document_id}`);
    console.log(`Provider: ${savedResult.provider}`);
    console.log(`Processing Time: ${savedResult.processing_time}ms`);
    console.log(`Confidence: ${savedResult.confidence}`);
    console.log(`Storage Path: ${savedResult.storage_path}`);
    console.log(`Image URL: ${savedResult.image_url ? savedResult.image_url.substring(0, 50) + '...' : 'None'}`);
    console.log(`Text Preview: ${savedResult.text ? savedResult.text.substring(0, 100) + (savedResult.text.length > 100 ? '...' : '') : 'No text'}`);
    
    // Clean up temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log('🧹 Temporary file cleaned up');
    }
    
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
directOCRProcess(documentId);
