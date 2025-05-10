// Check OCR settings and API key
// Run with: node scripts/check-ocr-settings.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
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

async function checkOCRSettings() {
  console.log('🔍 CHECKING OCR SETTINGS');
  console.log('=======================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  console.log('Using Supabase URL:', SUPABASE_URL);

  try {
    // Step 1: Check environment variables
    console.log('\n🔐 STEP 1: Checking environment variables...');
    
    console.log('NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✅ Set' : '❌ Not set');
    console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set');
    console.log('OCR_API_KEY:', OCR_API_KEY ? '✅ Set' : '❌ Not set');
    
    if (OCR_API_KEY) {
      console.log('OCR_API_KEY length:', OCR_API_KEY.length);
      console.log('OCR_API_KEY prefix:', OCR_API_KEY.substring(0, 5) + '...');
    }

    // Step 2: Authenticate with Supabase
    console.log('\n🔐 STEP 2: Authenticating with Supabase...');
    
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

    // Step 3: Check database schema
    console.log('\n🔍 STEP 3: Checking database schema...');
    
    // Check user_settings table
    const { data: userSettingsInfo, error: userSettingsError } = await supabase
      .from('user_settings')
      .select('count(*)')
      .limit(1);
    
    if (userSettingsError) {
      console.error('❌ Error accessing user_settings table:', userSettingsError);
    } else {
      console.log('✅ user_settings table exists');
    }
    
    // Check documents table
    const { data: documentsInfo, error: documentsError } = await supabase
      .from('documents')
      .select('count(*)')
      .limit(1);
    
    if (documentsError) {
      console.error('❌ Error accessing documents table:', documentsError);
    } else {
      console.log('✅ documents table exists');
    }
    
    // Check ocr_results table
    const { data: ocrResultsInfo, error: ocrResultsError } = await supabase
      .from('ocr_results')
      .select('count(*)')
      .limit(1);
    
    if (ocrResultsError) {
      console.error('❌ Error accessing ocr_results table:', ocrResultsError);
    } else {
      console.log('✅ ocr_results table exists');
    }

    // Step 4: Check user settings
    console.log('\n⚙️ STEP 4: Checking user settings...');
    
    // Try to get user settings
    const { data: userSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', authData.user.id)
      .single();
    
    if (settingsError) {
      console.error('❌ Error getting user settings:', settingsError);
      
      // Check if the error is due to missing user_id column
      if (settingsError.message && settingsError.message.includes('column user_settings.user_id does not exist')) {
        console.log('⚠️ The user_settings table might not have a user_id column');
        
        // Check the structure of the user_settings table
        console.log('Checking user_settings table structure...');
        
        // This is a workaround to get table structure in Supabase
        const { data: settingsData, error: structError } = await supabase
          .from('user_settings')
          .select('*')
          .limit(1);
        
        if (structError) {
          console.error('❌ Error getting user_settings structure:', structError);
        } else if (settingsData && settingsData.length > 0) {
          console.log('✅ user_settings table structure:');
          console.log(Object.keys(settingsData[0]));
        } else {
          console.log('⚠️ No records found in user_settings table');
        }
      }
    } else if (userSettings) {
      console.log('✅ User settings found');
      console.log('Settings ID:', userSettings.id);
      
      // Check OCR settings
      if (userSettings.ocr_settings) {
        console.log('✅ OCR settings found');
        console.log('Provider:', userSettings.ocr_settings.provider);
        console.log('API Key set:', userSettings.ocr_settings.apiKey ? '✅ Yes' : '❌ No');
        console.log('Use system key:', userSettings.ocr_settings.useSystemKey);
      } else {
        console.log('❌ No OCR settings found in user settings');
      }
    } else {
      console.log('⚠️ No user settings found for this user');
    }

    // Step 5: Test OCR API key
    console.log('\n🔑 STEP 5: Testing OCR API key...');
    
    if (!OCR_API_KEY) {
      console.error('❌ No OCR API key found in environment variables');
    } else {
      try {
        // Test with Mistral API
        const response = await fetch('https://api.mistral.ai/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${OCR_API_KEY}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Mistral API key is valid');
          console.log('Available models:', data.data.map(model => model.id).join(', '));
          
          // Check if mistral-ocr-latest is available
          const ocrModel = data.data.find(model => model.id === 'mistral-ocr-latest');
          if (ocrModel) {
            console.log('✅ mistral-ocr-latest model is available');
          } else {
            console.warn('⚠️ mistral-ocr-latest model not found in available models');
          }
        } else {
          const errorData = await response.json();
          console.error('❌ Mistral API key is invalid:', errorData);
        }
      } catch (error) {
        console.error('❌ Error testing Mistral API key:', error);
      }
    }

    console.log('\n✨ CHECK COMPLETED ✨');
    
  } catch (error) {
    console.error('❌ Error during check:', error);
    process.exit(1);
  }
}

checkOCRSettings();
