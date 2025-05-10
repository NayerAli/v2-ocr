// Check environment variables
// Run with: node scripts/check-env-vars.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Setup paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

console.log('🔍 CHECKING ENVIRONMENT VARIABLES');
console.log('===============================\n');

// Check Supabase credentials
console.log('Supabase Credentials:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Not set');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Not set');

// Check OCR API keys
console.log('\nOCR API Keys:');
console.log('OCR_API_KEY:', process.env.OCR_API_KEY ? '✅ Set' : '❌ Not set');
if (process.env.OCR_API_KEY) {
  console.log('OCR_API_KEY length:', process.env.OCR_API_KEY.length);
  console.log('OCR_API_KEY prefix:', process.env.OCR_API_KEY.substring(0, 5) + '...');
}

// Check other environment variables
console.log('\nOther Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');
console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'Not set');

// Check .env.local file
console.log('\nChecking .env.local file:');
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  console.log('✅ .env.local file exists');
  
  // Read the file and count the number of variables
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  console.log(`📊 Number of variables in .env.local: ${envLines.length}`);
  
  // Check for OCR_API_KEY
  const hasOcrApiKey = envLines.some(line => line.startsWith('OCR_API_KEY='));
  console.log(`OCR_API_KEY in .env.local: ${hasOcrApiKey ? '✅ Found' : '❌ Not found'}`);
  
  // List all variable names (without values)
  console.log('\nVariable names in .env.local:');
  envLines.forEach(line => {
    const varName = line.split('=')[0];
    console.log(`- ${varName}`);
  });
} else {
  console.log('❌ .env.local file does not exist');
}

console.log('\n✨ CHECK COMPLETED ✨');
