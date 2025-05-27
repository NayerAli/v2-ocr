import { createClient } from './client'

// Create a singleton Supabase client to be used across the application
let supabaseClient: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    
    console.log('Creating Supabase client with URL:', supabaseUrl ? 'URL provided' : 'URL missing');

    // Create client with SSR implementation
    supabaseClient = createClient()

    console.log('Supabase client created successfully');
  }

  return supabaseClient
}
