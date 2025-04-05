// This script checks if the settings table exists and has the correct schema
// If not, it creates or updates the table

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkAndFixSettingsTable() {
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
    console.log('Checking settings table...');

    // Check if the settings table exists
    const { data: tableExists, error: tableError } = await supabase
      .from('settings')
      .select('*')
      .limit(1);

    if (tableError) {
      if (tableError.code === '42P01') { // Table doesn't exist
        console.log('Settings table does not exist. Creating it...');
        await createSettingsTable(supabase);
      } else {
        console.error('Error checking settings table:', tableError);
        
        // Try to check the schema
        const { data: columns, error: columnsError } = await supabase.rpc('get_table_columns', { table_name: 'settings' });
        
        if (columnsError) {
          console.error('Error checking table columns:', columnsError);
          console.log('Attempting to create or update the settings table...');
          await createSettingsTable(supabase);
        } else {
          console.log('Table columns:', columns);
          const hasDataColumn = columns.some(col => col.column_name === 'data');
          
          if (!hasDataColumn) {
            console.log('The data column is missing. Updating the table schema...');
            await updateSettingsTable(supabase);
          }
        }
      }
    } else {
      console.log('Settings table exists. Checking schema...');
      
      // Check if the data column exists
      try {
        const { data: processingSettings, error: settingsError } = await supabase
          .from('settings')
          .select('data')
          .eq('id', 'processing')
          .single();
        
        if (settingsError && settingsError.code === '42703') { // Column doesn't exist
          console.log('The data column is missing. Updating the table schema...');
          await updateSettingsTable(supabase);
        } else if (!settingsError) {
          console.log('Settings table schema is correct.');
          
          // Initialize processing settings if they don't exist
          if (!processingSettings) {
            await initializeProcessingSettings(supabase);
          }
        }
      } catch (error) {
        console.error('Error checking data column:', error);
        await updateSettingsTable(supabase);
      }
    }

    console.log('Settings table check completed.');
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

async function createSettingsTable(supabase) {
  try {
    // Create the settings table with the correct schema
    const { error } = await supabase.rpc('create_settings_table');
    
    if (error) {
      console.error('Error creating settings table via RPC:', error);
      console.log('Attempting direct SQL execution...');
      
      // Try direct SQL execution
      const { error: sqlError } = await supabase.sql`
        CREATE TABLE IF NOT EXISTS public.settings (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          data JSONB NOT NULL,
          is_editable BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        
        -- Set up Row Level Security (RLS) policies
        ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
        
        -- Create policies
        CREATE POLICY "Allow all operations for authenticated users" ON public.settings
          FOR ALL USING (auth.role() = 'authenticated');
        
        CREATE POLICY "Allow read for anonymous users" ON public.settings
          FOR SELECT USING (auth.role() = 'anon');
      `;
      
      if (sqlError) {
        console.error('Error creating settings table via SQL:', sqlError);
        return;
      }
    }
    
    console.log('Settings table created successfully.');
    
    // Initialize processing settings
    await initializeProcessingSettings(supabase);
  } catch (error) {
    console.error('Error creating settings table:', error);
  }
}

async function updateSettingsTable(supabase) {
  try {
    // Add the data column to the settings table
    const { error } = await supabase.sql`
      ALTER TABLE public.settings 
      ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
    `;
    
    if (error) {
      console.error('Error updating settings table:', error);
      return;
    }
    
    console.log('Settings table updated successfully.');
    
    // Initialize processing settings
    await initializeProcessingSettings(supabase);
  } catch (error) {
    console.error('Error updating settings table:', error);
  }
}

async function initializeProcessingSettings(supabase) {
  try {
    // Default processing settings
    const DEFAULT_PROCESSING_SETTINGS = {
      maxConcurrentJobs: 2,
      pagesPerChunk: 2,
      concurrentChunks: 1,
      retryAttempts: 2,
      retryDelay: 1000
    };
    
    console.log('Initializing processing settings...');
    
    // Check if processing settings exist
    const { data: existingSettings, error: fetchError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'processing')
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error checking for existing settings:', fetchError);
      return;
    }
    
    if (existingSettings) {
      console.log('Processing settings already exist.');
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
        return;
      }
      
      console.log('Processing settings initialized successfully!');
    }
  } catch (error) {
    console.error('Error initializing processing settings:', error);
  }
}

// Run the check
checkAndFixSettingsTable();
