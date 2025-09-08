import { supabase } from '../supabase-client'

// Return the shared Supabase client instance
// This may return null if Supabase is not configured, allowing the
// application to handle missing credentials gracefully (e.g. during build)
export function getSupabaseClient() {
  return supabase
}
