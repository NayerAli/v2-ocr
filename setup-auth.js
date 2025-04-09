// This script runs the SQL setup for user authentication
// It should be run after the Supabase project is created

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Get Supabase URL and service role key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Read the SQL setup file
const sqlFilePath = path.join(__dirname, 'supabase-auth-setup.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

async function runSetup() {
  console.log('Running SQL setup for user authentication...');
  
  try {
    // Execute the SQL
    const { error } = await supabase.sql(sqlContent);
    
    if (error) {
      console.error('Error executing SQL:', error);
      process.exit(1);
    }
    
    console.log('SQL setup completed successfully!');
  } catch (err) {
    console.error('Error running setup:', err);
    process.exit(1);
  }
}

runSetup();
