// This script fixes the settings table in Supabase
// Run this script to fix the settings table schema

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function fixSettingsTable() {
  // Check if Supabase credentials are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('Fixing settings table...');

    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '..', 'supabase-settings-fix.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // Execute the SQL
    const { error } = await supabase.sql(sqlContent);

    if (error) {
      console.error('Error executing SQL:', error);
      process.exit(1);
    }

    console.log('SQL executed successfully.');

    // Check if the settings table exists and has the correct schema
    const { data: tableExists, error: tableError } = await supabase
      .from('settings')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('Error checking settings table:', tableError);
      process.exit(1);
    }

    console.log('Settings table exists.');

    // Check if the data column exists
    try {
      const { data: processingSettings, error: settingsError } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'processing')
        .single();

      if (settingsError && settingsError.code === '42703') {
        console.error('Data column still does not exist:', settingsError);
        
        // Try to add the data column directly
        const { error: alterError } = await supabase.sql`
          ALTER TABLE public.settings 
          ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
        `;
        
        if (alterError) {
          console.error('Error adding data column:', alterError);
          process.exit(1);
        }
        
        console.log('Data column added successfully.');
      } else if (settingsError) {
        console.error('Error checking data column:', settingsError);
      } else {
        console.log('Data column exists.');
        
        if (processingSettings) {
          console.log('Processing settings exist:', processingSettings);
        } else {
          console.log('Processing settings do not exist. Creating...');
          
          // Create default processing settings
          const DEFAULT_PROCESSING_SETTINGS = {
            maxConcurrentJobs: 2,
            pagesPerChunk: 2,
            concurrentChunks: 1,
            retryAttempts: 2,
            retryDelay: 1000
          };
          
          const { error: insertError } = await supabase
            .from('settings')
            .insert({
              id: 'processing',
              category: 'system',
              data: DEFAULT_PROCESSING_SETTINGS,
              is_editable: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          
          if (insertError) {
            console.error('Error creating processing settings:', insertError);
            process.exit(1);
          }
          
          console.log('Processing settings created successfully.');
        }
      }
    } catch (error) {
      console.error('Error checking data column:', error);
      process.exit(1);
    }

    console.log('Settings table fix completed.');
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the fix
fixSettingsTable();
