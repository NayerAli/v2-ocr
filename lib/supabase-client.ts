import { createClient } from './supabase/client'

// Check if Supabase credentials are available
const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

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

// Use our new SSR client implementation
export const supabase = hasCredentials
  ? createClient()
  : null // Better to return null than a fake client

// Helper function to check if Supabase is properly configured
export const isSupabaseConfigured = (): boolean => {
  return hasCredentials
}
