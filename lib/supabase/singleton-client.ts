import { createClient } from './client'
import { prodLog } from '../log'

// Create a singleton Supabase client to be used across the application
let supabaseClient: ReturnType<typeof createClient> | null = null

export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not found')
    }

    prodLog('Creating Supabase client with URL:', 'URL provided')

    // Create client with SSR implementation
    supabaseClient = createClient()

    prodLog('Supabase client created successfully')
  }

  return supabaseClient
}
