import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Create a Supabase client with service role key for admin operations
 * This should only be used on the server side for admin operations
 */
export function createServiceClient() {
  if (typeof window !== 'undefined') {
    console.error('Service client should not be used on the client side')
    throw new Error('Service client should not be used on the client side')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or service role key')
    throw new Error('Missing Supabase URL or service role key')
  }

  return createSupabaseClient<Database>(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Alias the service client factory to match imports elsewhere
export const getServiceClient = createServiceClient
