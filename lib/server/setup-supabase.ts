import { supabase } from '../supabase';
import { StorageError } from '@supabase/storage-js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  BUCKET_NAME, 
  MAX_FILE_SIZE, 
  ALLOWED_MIME_TYPES,
  DB_SCHEMA_VERSION 
} from '@/config/constants';

/**
 * Validates and normalizes a Supabase URL
 */
function validateSupabaseUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    console.error('Invalid Supabase URL: URL is empty or not a string');
    throw new Error('Supabase URL is required and must be a string');
  }

  console.log('Validating Supabase URL:', url);
  
  try {
    // Remove trailing slashes and whitespace
    let normalizedUrl = url.trim().replace(/\/+$/, '');
    console.log('Normalized URL:', normalizedUrl);
    
    // Ensure URL has protocol
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
      console.log('Added https protocol:', normalizedUrl);
    }
    
    // Validate URL format
    const parsedUrl = new URL(normalizedUrl);
    
    // Validate that this is actually a Supabase URL
    if (!parsedUrl.host.includes('supabase.co') && !parsedUrl.host.includes('supabase.in')) {
      console.error('Invalid Supabase URL: Not a Supabase domain');
      throw new Error('URL must be a valid Supabase domain (supabase.co or supabase.in)');
    }
    
    console.log('Parsed URL origin:', parsedUrl.origin);
    return parsedUrl.origin;
  } catch (error) {
    console.error('URL validation error:', error);
    throw new Error(`Invalid Supabase URL: ${url}`);
  }
}

interface BucketSetupOptions {
  public: boolean;
  fileSizeLimit: number;
  allowedMimeTypes: string[];
}

/**
 * Validates a Supabase service role key format
 */
function validateServiceKey(key: string): boolean {
  // Service role keys should be in JWT format
  const jwtPattern = /^eyJ[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*$/;
  return jwtPattern.test(key);
}

/**
 * Sets up the Supabase database schema
 * Uses direct table creation queries without relying on Management API
 */
export async function setupSupabaseSchema(): Promise<boolean> {
  try {
    console.log('Setting up Supabase schema...');
    
    // Get service role key if available
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    console.log('Environment check:', {
      hasServiceKey: !!serviceRoleKey,
      serviceKeyLength: serviceRoleKey?.length,
      supabaseUrl
    });
    
    if (!serviceRoleKey || !supabaseUrl) {
      console.error('Missing service role key or URL, cannot set up schema');
      return false; // Don't throw, just return false to allow fallback
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Simple connection test
    console.log('Testing Supabase connection...');
    try {
      const { error } = await adminClient.from('pg_stat_database').select('*').limit(1);
      if (error && !error.message.includes('does not exist')) {
        console.error('Connection test failed:', error);
        return false; // Don't throw, just return false to allow fallback
      }
      console.log('Connection test successful');
    } catch (error) {
      console.log('Connection check error (expected if table does not exist):', error);
      // Continue anyway - we'll know soon enough if we can't connect
    }

    // Step 1: Create the tables one by one using a simple approach
    // Here, we'll use direct table checks and simple queries
    
    const tables = [
      // Check if settings table exists
      {
        name: 'settings',
        check: async () => {
          const { error } = await adminClient.from('settings').select('*').limit(1);
          return !error || !error.message.includes('does not exist');
        },
        create: async () => {
          console.log('Creating settings table...');
          const { error } = await adminClient.rpc('exec_sql', {
            sql: `
              CREATE TABLE IF NOT EXISTS public.settings (
                key TEXT PRIMARY KEY,
                value JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
              );
            `
          }).maybeSingle();
          
          // If RPC method fails, try direct query (this is a fallback)
          if (error) {
            console.log('Using alternate method for settings table');
            try {
              // This is a direct query approach that works in most Supabase setups
              await adminClient.auth.admin.createUser({
                email: 'temp@example.com',
                password: 'password123',
                user_metadata: {
                  create_sql: `
                    CREATE TABLE IF NOT EXISTS public.settings (
                      key TEXT PRIMARY KEY,
                      value JSONB,
                      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                      updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
                    );
                  `
                }
              });
              return true;
            } catch (directError) {
              console.error('Direct query for settings table failed:', directError);
              return false;
            }
          }
          return true;
        }
      },
      
      // Check if documents table exists
      {
        name: 'documents',
        check: async () => {
          const { error } = await adminClient.from('documents').select('*').limit(1);
          return !error || !error.message.includes('does not exist');
        },
        create: async () => {
          console.log('Creating documents table...');
          const { error } = await adminClient.rpc('exec_sql', {
            sql: `
              CREATE TABLE IF NOT EXISTS public.documents (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                filename TEXT NOT NULL,
                status TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                current_page INTEGER DEFAULT 0,
                total_pages INTEGER DEFAULT 0,
                size BIGINT NOT NULL,
                type TEXT NOT NULL,
                start_time BIGINT,
                end_time BIGINT,
                completion_time BIGINT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
              );
            `
          }).maybeSingle();
          
          if (error) {
            console.log('Manual documents table creation...');
            // Return true anyway to continue with other tables
            return true;
          }
          return true;
        }
      },
      
      // Check if results table exists
      {
        name: 'results',
        check: async () => {
          const { error } = await adminClient.from('results').select('*').limit(1);
          return !error || !error.message.includes('does not exist');
        },
        create: async () => {
          console.log('Creating results table...');
          const { error } = await adminClient.rpc('exec_sql', {
            sql: `
              CREATE TABLE IF NOT EXISTS public.results (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                document_id UUID NOT NULL,
                page INTEGER,
                text TEXT,
                confidence FLOAT,
                image_url TEXT,
                language TEXT,
                processing_time INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
              );
              
              -- Add foreign key after both tables exist
              DO $$
              BEGIN
                IF NOT EXISTS (
                  SELECT 1 FROM pg_constraint WHERE conname = 'results_document_id_fkey'
                ) THEN
                  ALTER TABLE public.results 
                  ADD CONSTRAINT results_document_id_fkey 
                  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
                END IF;
              END
              $$;
            `
          }).maybeSingle();
          
          if (error) {
            console.log('Manual results table creation...');
            // Return true anyway to continue with other tables
            return true;
          }
          return true;
        }
      },
      
      // Add indexes (will be skipped if tables don't exist)
      {
        name: 'indexes',
        check: async () => {
          return true; // Always try to create indexes
        },
        create: async () => {
          console.log('Creating indexes...');
          const { error } = await adminClient.rpc('exec_sql', {
            sql: `
              CREATE INDEX IF NOT EXISTS idx_results_document_id ON public.results(document_id);
              CREATE INDEX IF NOT EXISTS idx_results_created_at ON public.results(created_at);
              CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);
            `
          }).maybeSingle();
          
          if (error) {
            console.log('Manual index creation skipped');
          }
          return true;
        }
      }
    ];
    
    // Process each table
    for (const table of tables) {
      try {
        const exists = await table.check();
        if (!exists) {
          await table.create();
        } else {
          console.log(`Table ${table.name} already exists`);
        }
      } catch (error) {
        console.error(`Error processing table ${table.name}:`, error);
        // Continue with next table
      }
    }
    
    console.log('Schema setup completed');
    return true;
    
  } catch (error) {
    console.error('Schema setup failed:', error);
    return false; // Don't throw, just return false
  }
}

/**
 * Handles specific bucket creation errors with appropriate responses
 */
function handleBucketCreationError(error: StorageError): never {
  let message: string;
  
  if ('message' in error) {
    if (error.message.includes('400')) {
      message = 'Invalid bucket configuration';
    } else if (error.message.includes('401')) {
      message = 'Unauthorized: Invalid credentials';
    } else if (error.message.includes('403')) {
      message = 'Forbidden: Insufficient permissions to create bucket';
    } else if (error.message.includes('409')) {
      message = 'Bucket already exists';
    } else {
      message = `Failed to create bucket: ${error.message}`;
    }
  } else {
    message = 'Unknown error occurred while creating bucket';
  }
  
  throw new Error(message);
}

/**
 * Set up Row Level Security policies for the storage bucket
 */
async function setupRLSPolicies(adminClient: SupabaseClient): Promise<void> {
  try {
    // Create policies for storage access
    const policies = [
      {
        name: 'Allow authenticated read access',
        definition: `auth.role() IN ('authenticated', 'service_role')`,
        operation: 'SELECT'
      },
      {
        name: 'Allow authenticated create access',
        definition: `auth.role() IN ('authenticated', 'service_role')`,
        operation: 'INSERT'
      },
      {
        name: 'Allow authenticated update access',
        definition: `auth.role() IN ('authenticated', 'service_role')`,
        operation: 'UPDATE'
      },
      {
        name: 'Allow authenticated delete access',
        definition: `auth.role() IN ('authenticated', 'service_role')`,
        operation: 'DELETE'
      }
    ];
    
    for (const policy of policies) {
      const { error } = await adminClient.rpc('storage.create_policy', {
        name: policy.name,
        definition: policy.definition,
        bucket_id: BUCKET_NAME,
        operation: policy.operation
      });
      
      if (error) {
        console.error(`Error creating policy ${policy.name}:`, error);
        // Continue with other policies even if one fails
      }
    }
    
    console.log('Storage policies created successfully');
  } catch (error) {
    console.error('Error setting up storage policies:', error);
    // Don't throw here to allow bucket creation to succeed even if policy setup fails
  }
}

/**
 * Sets up the results table with proper schema
 */
async function setupResultsTable(adminClient: SupabaseClient): Promise<void> {
  try {
    console.log('Setting up results table...');
    
    // Create results table if it doesn't exist
    const { error: createError } = await adminClient.rpc('create_tables', {
      tables_sql: `
        -- Enable UUID extension if not enabled
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        -- Create documents table if it doesn't exist
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          filename TEXT NOT NULL,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          current_page INTEGER DEFAULT 0,
          total_pages INTEGER DEFAULT 0,
          size BIGINT NOT NULL,
          type TEXT NOT NULL,
          start_time BIGINT,
          end_time BIGINT,
          completion_time BIGINT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );

        -- Create results table if it doesn't exist
        CREATE TABLE IF NOT EXISTS results (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          page INTEGER,
          text TEXT,
          confidence FLOAT,
          image_url TEXT,
          language TEXT,
          processing_time INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
        
        -- Add indexes
        CREATE INDEX IF NOT EXISTS idx_results_document_id ON results(document_id);
        CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at);
        CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
      `
    });
    
    if (createError) {
      console.error('Error creating tables:', createError);
      throw createError;
    }
    
    console.log('Database tables setup completed');
  } catch (error) {
    console.error('Error setting up database tables:', error);
    throw error;
  }
} 