import { createBrowserClient } from '@supabase/ssr'

// Create a singleton instance to prevent multiple client instances
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Create a Supabase client for browser side that uses cookies for auth.
 * Uses a singleton pattern to prevent multiple instances.
 */
export function createClient() {
  if (supabaseClient) {
    return supabaseClient
  }
  
  supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  return supabaseClient
}
