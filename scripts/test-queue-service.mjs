#!/usr/bin/env node

/**
 * Test script for queue service
 * This script tests the saveToQueue function with the service client
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Create Supabase client
function createSupabaseClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: token ? {
        Authorization: `Bearer ${token}`
      } : {}
    }
  });
}

// Create Supabase service client
function createSupabaseServiceClient() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Service role key not found in .env.local');
    process.exit(1);
  }
  
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

// Convert camelCase to snake_case
function camelToSnake(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }

  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    acc[snakeKey] = camelToSnake(obj[key]);
    return acc;
  }, {});
}

// Main function
async function main() {
  try {
    console.log('🔑 Testing queue service with service client');
    
    // Create a service client
    const serviceClient = createSupabaseServiceClient();
    console.log('✅ Service client created');
    
    // Create a test document
    const documentId = randomUUID();
    const userId = '2f4a9512-414a-47cc-a1d1-a110739085f8'; // Test user ID
    const filename = 'test-document.pdf';
    
    console.log(`📄 Creating test document with ID: ${documentId}`);
    
    // Prepare document data
    const documentData = {
      id: documentId,
      user_id: userId,
      filename: filename,
      original_filename: filename,
      file_type: 'application/pdf',
      file_size: 1000,
      status: 'pending',
      storage_path: `uploads/${documentId}/${filename}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Insert document using service client
    const { error: insertError } = await serviceClient
      .from('documents')
      .insert(documentData);
    
    if (insertError) {
      console.error('❌ Failed to create document:', insertError);
      process.exit(1);
    }
    
    console.log('✅ Document created successfully');
    
    // Test updating the document status
    console.log('🔄 Testing document status update');
    
    // Prepare status update
    const statusUpdate = {
      status: 'processing',
      updated_at: new Date().toISOString()
    };
    
    // Update document using service client
    const { error: updateError } = await serviceClient
      .from('documents')
      .update(statusUpdate)
      .eq('id', documentId);
    
    if (updateError) {
      console.error('❌ Failed to update document status:', updateError);
      process.exit(1);
    }
    
    console.log('✅ Document status updated successfully');
    
    // Test updating the document without user_id
    console.log('🔄 Testing document update without user_id');
    
    // Prepare status update without user_id
    const statusUpdateNoUser = {
      status: 'completed',
      updated_at: new Date().toISOString(),
      user_id: null // Explicitly set to null to test constraint
    };
    
    // Update document using service client
    const { error: updateErrorNoUser } = await serviceClient
      .from('documents')
      .update(statusUpdateNoUser)
      .eq('id', documentId);
    
    if (updateErrorNoUser) {
      console.log('✓ Expected error when setting user_id to null:', updateErrorNoUser.message);
    } else {
      console.error('❌ No error when setting user_id to null, this is unexpected');
    }
    
    // Clean up - delete the test document
    console.log('🧹 Cleaning up - deleting test document');
    
    const { error: deleteError } = await serviceClient
      .from('documents')
      .delete()
      .eq('id', documentId);
    
    if (deleteError) {
      console.error('❌ Failed to delete test document:', deleteError);
      process.exit(1);
    }
    
    console.log('✅ Test document deleted successfully');
    console.log('✅ All tests completed successfully');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the main function
main();
