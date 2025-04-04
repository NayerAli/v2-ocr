import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Check if Supabase credentials are available
const hasCredentials = Boolean(supabaseUrl && supabaseKey)

if (!hasCredentials) {
  console.error('Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.')

  // In development, show a more visible error
  if (process.env.NODE_ENV === 'development') {
    // This will only run on the client side
    if (typeof window !== 'undefined') {
      window.alert('Supabase credentials missing. Check your .env.local file.')
    }
  }
}

// Create the Supabase client with a fallback URL if not configured
// This prevents the 'Invalid URL' error but the client won't work without proper credentials
const fallbackUrl = 'http://localhost:8000' // This is just a placeholder
export const supabase = hasCredentials
  ? createClient<Database>(supabaseUrl, supabaseKey)
  : createClient<Database>(fallbackUrl, 'fallback-key')

// Helper function to check if Supabase is properly configured
export const isSupabaseConfigured = (): boolean => {
  return hasCredentials
}
