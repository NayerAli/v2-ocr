// Configuration utilities for Supabase

import { getSupabaseClient } from '../../supabase/singleton-client'

// Get the singleton Supabase client
export const supabase = getSupabaseClient()

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  console.log('[DEBUG] Checking Supabase configuration');
  console.log('[DEBUG] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');
  console.log('[DEBUG] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');

  const isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log('[DEBUG] Supabase is configured:', isConfigured);

  return isConfigured;
}
