const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Get Supabase URL and key from environment or use defaults for local development
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    console.error('Error: Missing Supabase service role key or anon key');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}`);

  // Create Supabase client with admin privileges
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Read the SQL migration file
    const migrationPath = path.join(__dirname, '..', 'add_missing_columns.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration SQL...');
    
    // Execute the SQL migration
    const { error } = await supabase.rpc('pgrest_exec', { sql });

    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('Migration completed successfully!');
    
    // Verify columns were added
    const { data, error: verifyError } = await supabase
      .from('results')
      .select('language, processing_time')
      .limit(1);

    if (verifyError) {
      console.error('Error verifying columns:', verifyError);
    } else {
      console.log('Column verification successful');
    }
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  }
}

runMigration(); 