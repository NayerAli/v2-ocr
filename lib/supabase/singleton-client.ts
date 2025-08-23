import { createClient } from './client'
import { prodLog } from '../log'

// Create a singleton Supabase client to be used across the application
let supabaseClient: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    
    prodLog('Creating Supabase client with URL:', supabaseUrl ? 'URL provided' : 'URL missing');

    // Create client with SSR implementation
    supabaseClient = createClient()

    prodLog('Supabase client created successfully');
  }

  return supabaseClient
}
