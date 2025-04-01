import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Ensure environment variables are available and valid
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Check if Supabase environment variables are available
const isSupabaseAvailable = !!(supabaseUrl && supabaseAnonKey)

// Create and export the Supabase client if environment variables are available
export const supabase = isSupabaseAvailable 
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!)
  : null

// Function to check if Supabase is available
export function isSupabaseEnabled(): boolean {
  return isSupabaseAvailable
}

// Function to get Supabase client (with error handling)
export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Check your environment variables.')
  }
  return supabase
} 