// Test script to directly call the document processor
// Run with: node scripts/test-document-processor.js <documentId>

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Import required modules
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DOCUMENT_ID = process.argv[2]; // Get document ID from command line

// Validate inputs
if (!DOCUMENT_ID) {
  console.error('❌ Document ID is required. Usage: node scripts/test-document-processor.js <documentId>');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Service role key not found in .env.local');
  process.exit(1);
}

// Create service client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Mock the server-wrapper createClient function
const mockCreateClient = () => {
  return supabase;
};

// Mock the necessary modules
jest.mock('@/utils/supabase/server-wrapper', () => ({
  createClient: mockCreateClient
}));

// Import the document processor
const { processDocumentNow } = require('../lib/ocr/document-processor');

// Process the document
async function processDocument() {
  try {
    console.log('🔍 Processing document:', DOCUMENT_ID);
    
    // Check if document exists
    const { data: document, error: checkError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', DOCUMENT_ID)
      .single();
    
    if (checkError || !document) {
      console.error('❌ Document not found:', checkError || 'No document returned');
      process.exit(1);
    }
    
    console.log('📄 Document found:', document.id, document.filename, document.status);
    
    // Process the document
    console.log('🔄 Starting document processing...');
    const result = await processDocumentNow(DOCUMENT_ID);
    
    console.log('✅ Document processing completed');
    console.log('📊 Result:', result);
    
    // Check OCR results
    const { data: results, error: resultsError } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', DOCUMENT_ID);
    
    if (resultsError) {
      console.error('❌ Error fetching OCR results:', resultsError);
      process.exit(1);
    }
    
    if (!results || results.length === 0) {
      console.error('❌ No OCR results found for document');
      process.exit(1);
    }
    
    console.log(`✅ Found ${results.length} OCR results`);
    
    // Print summary
    console.log('\n📋 Test Summary:');
    console.log(`Document ID: ${DOCUMENT_ID}`);
    console.log(`Results Count: ${results.length}`);
    console.log(`Final Status: ${result.status}`);
    
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Error processing document:', error);
    process.exit(1);
  }
}

// Run the test
processDocument();
