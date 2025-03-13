import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// For local development, we'll create a Supabase client even without environment variables
// This allows for easier development and testing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Create Supabase client with additional options
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  }
});

// Check if Supabase is available (for development mode)
export async function isSupabaseAvailable(): Promise<boolean> {
  try {
    // First, check if we have valid environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.log('Supabase environment variables not set');
      return false;
    }
    
    // Try a simple query to check connection
    const { data, error } = await supabase.from('settings').select('id').limit(1);
    
    // If there's an auth error or a server error, we consider it unavailable
    if (error) {
      console.log('Supabase connection error:', error.message);
      return false;
    }
    
    console.log('Supabase connection successful');
    return true;
  } catch (e) {
    console.error('Error checking Supabase availability:', e);
    return false;
  }
}

// Helper to handle Supabase fallback when not available
export async function withSupabaseFallback<T>(
  supabaseOperation: () => Promise<T>,
  fallbackOperation: () => Promise<T>
): Promise<T> {
  try {
    const isAvailable = await isSupabaseAvailable();
    
    if (isAvailable) {
      try {
        return await supabaseOperation();
      } catch (error) {
        console.error('Error in Supabase operation, using fallback:', error);
        return await fallbackOperation();
      }
    } else {
      console.log('Supabase not available, using fallback');
      return await fallbackOperation();
    }
  } catch (error) {
    console.error('Error checking Supabase availability, using fallback:', error);
    return await fallbackOperation();
  }
} 