// Configuration utilities for Supabase

import { debugLog } from '../../log'
import { createClient as createClientBrowser } from '@/utils/supabase/client'

export function getSupabaseClient() {
  // Always use the browser client to ensure client-side compatibility
  return createClientBrowser()
}

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
