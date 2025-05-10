// Simple test script for service client
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase service client
function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase URL or service role key');
    return null;
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

async function main() {
  console.log('Testing service client...');
  
  // Create service client
  const serviceClient = createServiceClient();
  if (!serviceClient) {
    console.error('Failed to create service client');
    process.exit(1);
  }
  
  console.log('Service client created successfully');
  
  try {
    // Test query
    const { data, error } = await serviceClient
      .from('documents')
      .select('id, user_id, status')
      .limit(5);
    
    if (error) {
      console.error('Error querying documents:', error);
      process.exit(1);
    }
    
    console.log('Query successful, found', data.length, 'documents');
    console.log('Sample document:', data[0]);
    
    // Test update with user_id
    const testId = data[0]?.id;
    if (testId) {
      console.log('Testing update with user_id for document:', testId);
      
      const { error: updateError } = await serviceClient
        .from('documents')
        .update({
          status: data[0].status, // Keep the same status
          user_id: data[0].user_id, // Keep the same user_id
          updated_at: new Date().toISOString()
        })
        .eq('id', testId);
      
      if (updateError) {
        console.error('Error updating document with user_id:', updateError);
      } else {
        console.log('Update with user_id successful');
      }
    }
    
    console.log('All tests completed');
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the main function
main();
