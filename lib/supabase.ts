import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// For server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.625_WdcF3KHqz5amU0x2X5WWHP-OEs_4qj0ssLNHzTs';

// Create Supabase client with anon key for client operations
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x'
    }
  }
});

// Check if Supabase is available
export async function isSupabaseAvailable(): Promise<boolean> {
  try {
    // Try a simple query to check connection
    const { data, error } = await supabase.from('settings').select('id').limit(1);
    
    // If there's an auth error or a server error, we consider it unavailable
    if (error) {
      console.log('Supabase server connection error:', error.message);
      return false;
    }
    
    console.log('Supabase server connection successful');
    return true;
  } catch (e) {
    console.error('Error checking Supabase server availability:', e);
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
        console.error('Error in Supabase server operation, using fallback:', error);
        return await fallbackOperation();
      }
    } else {
      console.log('Supabase server not available, using fallback');
      return await fallbackOperation();
    }
  } catch (error) {
    console.error('Error checking Supabase server availability, using fallback:', error);
    return await fallbackOperation();
  }
}