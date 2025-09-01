import { supabase } from '../supabase-client'

// Return the shared Supabase client instance
export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase client is not configured')
  }
  return supabase
}
