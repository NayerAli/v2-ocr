// This script initializes the settings in Supabase
// Run this script after setting up the Supabase database

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Default processing settings
const DEFAULT_PROCESSING_SETTINGS = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
};

async function initializeSettings() {
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
    console.log('Initializing settings in Supabase...');

    // Check if processing settings exist
    const { data: existingSettings, error: fetchError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'processing')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error checking for existing settings:', fetchError);
      process.exit(1);
    }

    if (existingSettings) {
      console.log('Processing settings already exist. Updating...');
      
      // Update existing settings
      const { error: updateError } = await supabase
        .from('settings')
        .update({
          data: DEFAULT_PROCESSING_SETTINGS,
          updated_at: new Date().toISOString()
        })
        .eq('id', 'processing');

      if (updateError) {
        console.error('Error updating processing settings:', updateError);
        process.exit(1);
      }
    } else {
      console.log('Creating new processing settings...');
      
      // Create new settings
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
    }

    console.log('Settings initialized successfully!');
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeSettings();
