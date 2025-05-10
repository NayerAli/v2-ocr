/**
 * Service client utility for database operations that need to bypass RLS
 * This should only be used in server contexts for operations that need admin privileges
 */

import { createClient } from '@supabase/supabase-js'
import { infoLog } from '../../log'

// Create a service role client for admin operations
let serviceClient: ReturnType<typeof createClient> | null = null

/**
 * Get a Supabase client with service role privileges
 * This bypasses RLS policies and should only be used in server contexts
 */
export function getServiceClient() {
  if (typeof window !== 'undefined') {
    console.error('Service client should not be used on the client side')
    return null
  }

  if (serviceClient) {
    return serviceClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or service role key')
    return null
  }

  serviceClient = createClient(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  return serviceClient
}

/**
 * Create a new Supabase client with service role privileges
 * This bypasses RLS policies and should only be used in server contexts
 */
export function createServiceClient() {
  if (typeof window !== 'undefined') {
    console.error('Service client should not be used on the client side')
    return null
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or service role key')
    return null
  }

  return createClient(
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

/**
 * Determine if we're in a server context
 */
export function isServerContext(): boolean {
  return typeof window === 'undefined'
}

/**
 * Get the appropriate client based on context
 * @param regularClient The regular client to use in client contexts
 * @returns The appropriate client for the current context
 */
export function getContextClient(regularClient: any) {
  if (isServerContext()) {
    infoLog('Using service client for server context')
    return getServiceClient() || regularClient
  }
  
  return regularClient
}
