import { createBrowserClient } from './config'

// Create a singleton Supabase client to be used across the application
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    
    console.log('Creating Supabase client with URL:', supabaseUrl ? 'URL provided' : 'URL missing');

    // Create client with centralized configuration
    supabaseClient = createBrowserClient()

    console.log('Supabase client created successfully');
  }

  return supabaseClient
}
