// This script initializes the settings table with the correct values
// Run this script with: node scripts/init-db-settings.js

// Import directly from our existing files instead of using external dependencies
const { supabase, isSupabaseConfigured } = require('../lib/supabase-client');

// Default processing settings
const DEFAULT_PROCESSING_SETTINGS = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
};

async function initializeSettings() {
  // Check if Supabase is configured
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot initialize settings.');
    process.exit(1);
  }

  try {
    // Check if the settings table exists
    const { error: tableError } = await supabase
      .from('settings')
      .select('id')
      .limit(1);

    if (tableError) {
      console.log('Settings table does not exist. Creating...');

      // Create the settings table
      const { error: createError } = await supabase.sql`
        CREATE TABLE IF NOT EXISTS public.settings (
          id INTEGER PRIMARY KEY,
          key TEXT NOT NULL,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `;

      if (createError) {
        console.error('Error creating settings table:', createError);
        process.exit(1);
      }

      console.log('Settings table created successfully.');
    }

    // Check if processing settings exist
    const { data: existingSettings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'processing')
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Error checking for existing settings:', settingsError);
    }

    if (existingSettings) {
      console.log('Processing settings already exist. Updating...');

      // Update existing settings
      const { error: updateError } = await supabase
        .from('settings')
        .update({
          value: DEFAULT_PROCESSING_SETTINGS,
          data: DEFAULT_PROCESSING_SETTINGS,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'processing');

      if (updateError) {
        console.error('Error updating processing settings:', updateError);
        process.exit(1);
      }

      console.log('Processing settings updated successfully.');
    } else {
      console.log('Creating new processing settings...');

      // Get the next available ID
      const { data: maxIdData } = await supabase
        .from('settings')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .single();

      const nextId = maxIdData ? (maxIdData.id + 1) : 1;

      // Create new settings
      const { error: insertError } = await supabase
        .from('settings')
        .insert({
          id: nextId,
          key: 'processing',
          value: DEFAULT_PROCESSING_SETTINGS,
          data: DEFAULT_PROCESSING_SETTINGS,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating processing settings:', insertError);
        process.exit(1);
      }

      console.log('Processing settings created successfully.');
    }

    // Verify the settings were saved correctly
    const { data: verifySettings, error: verifyError } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'processing')
      .single();

    if (verifyError) {
      console.error('Error verifying settings:', verifyError);
      process.exit(1);
    }

    console.log('Settings verified successfully:');
    console.log('ID:', verifySettings.id);
    console.log('Key:', verifySettings.key);
    console.log('Value:', verifySettings.value);
    console.log('Data:', verifySettings.data);

    console.log('Settings initialization complete.');
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeSettings().catch(err => {
  console.error('Failed to initialize settings:', err);
  process.exit(1);
});
