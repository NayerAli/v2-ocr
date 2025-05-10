// Upload and directly process an image
// Run with: node scripts/upload-and-process.mjs <image-path>

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

// Test credentials - replace with your test user
const TEST_EMAIL = 'test@test.com';  // Replace if needed
const TEST_PASSWORD = 'test12345';   // Replace if needed

// Default image path if not provided
const DEFAULT_IMAGE_PATH = path.resolve(__dirname, '145.jpg');

// Convert image to base64
function imageToBase64(filePath) {
  const fileData = fs.readFileSync(filePath);
  return Buffer.from(fileData).toString('base64');
}

async function uploadAndProcess(imagePath) {
  // Use default image path if not provided
  imagePath = imagePath || DEFAULT_IMAGE_PATH;
  
  console.log(`🔄 UPLOAD AND PROCESS: ${imagePath}`);
  console.log('===============================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image file not found at ${imagePath}`);
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

    // Step 2: Upload image to storage
    console.log('\n📤 STEP 2: Uploading image to storage...');
    
    // Generate a unique ID for the document
    const documentId = randomUUID();
    const fileName = path.basename(imagePath);
    const fileType = path.extname(imagePath).toLowerCase();
    const storagePath = `${authData.user.id}/${documentId}/Image_${documentId}${fileType}`;
    
    // Read the image file
    const fileBuffer = fs.readFileSync(imagePath);
    const fileSize = fileBuffer.length;
    
    // Upload to Supabase storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('ocr-documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (storageError) {
      console.error('❌ Failed to upload image to storage:', storageError);
      process.exit(1);
    }
    
    console.log('✅ Image uploaded to storage successfully');
    console.log('📄 Storage path:', storagePath);
    
    // Create document record in database
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
    
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();
    
    if (documentError) {
      console.error('❌ Failed to create document record:', documentError);
      process.exit(1);
    }
    
    console.log('✅ Document record created successfully');
    console.log('📄 Document ID:', documentId);

    // Step 3: Convert image to base64
    console.log('\n🔄 STEP 3: Converting image to base64...');
    
    const base64Data = imageToBase64(imagePath);
    console.log('✅ Image converted to base64');
    console.log(`📊 Base64 data length: ${base64Data.length} characters`);

    // Step 4: Get OCR settings
    console.log('\n⚙️ STEP 4: Getting OCR settings...');
    
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

    // Step 5: Process image with OCR API directly
    console.log('\n🔍 STEP 5: Processing image with OCR API...');
    
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
          storage_path: storagePath,
          provider: 'mistral'
        };
        
        // Generate a signed URL for the image
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('ocr-documents')
          .createSignedUrl(storagePath, 86400); // 24 hours
        
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

    // Step 6: Save OCR result to database
    console.log('\n💾 STEP 6: Saving OCR result to database...');
    
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

    // Step 7: Update document status to completed
    console.log('\n📝 STEP 7: Updating document status...');
    
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

    // Step 8: Display OCR result
    console.log('\n📝 STEP 8: OCR Result...');
    console.log('--- OCR Result ---');
    console.log(`ID: ${savedResult.id}`);
    console.log(`Document ID: ${savedResult.document_id}`);
    console.log(`Provider: ${savedResult.provider}`);
    console.log(`Processing Time: ${savedResult.processing_time}ms`);
    console.log(`Confidence: ${savedResult.confidence}`);
    console.log(`Storage Path: ${savedResult.storage_path}`);
    console.log(`Image URL: ${savedResult.image_url ? savedResult.image_url.substring(0, 50) + '...' : 'None'}`);
    console.log(`Text Preview: ${savedResult.text ? savedResult.text.substring(0, 100) + (savedResult.text.length > 100 ? '...' : '') : 'No text'}`);
    
    console.log('\n✨ PROCESSING COMPLETED ✨');
    console.log(`Document ID: ${documentId}`);
    console.log(`Visit: http://localhost:3000/documents/${documentId}`);
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
    process.exit(1);
  }
}

// Get image path from command line arguments
const imagePath = process.argv[2] || DEFAULT_IMAGE_PATH;
uploadAndProcess(imagePath);
