import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Create a singleton Supabase client to be used across the application
let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    console.log('Creating Supabase client with URL:', supabaseUrl ? 'URL provided' : 'URL missing');

    supabaseClient = createClient<Database>(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Use cookies for session storage to ensure server-side authentication works
          storageKey: 'sb-auth-token',
          flowType: 'pkce'
        }
      }
    )

    console.log('Supabase client created successfully');
  }

  return supabaseClient
}
