// Configuration utilities for Supabase

import { getSupabaseClient } from '../../supabase/singleton-client'
import { debugLog } from '../../log'

// Get the singleton Supabase client
export const supabase = getSupabaseClient()

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  debugLog('[DEBUG] Checking Supabase configuration');
  debugLog('[DEBUG] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');
  debugLog('[DEBUG] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');

  const isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  debugLog('[DEBUG] Supabase is configured:', isConfigured);

  return isConfigured;
}
