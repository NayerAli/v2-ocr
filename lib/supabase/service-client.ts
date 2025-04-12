import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Create a Supabase client with service role key for admin operations
// This should only be used on the server side
let serviceClient: ReturnType<typeof createClient<Database>> | null = null

export function getServiceClient() {
  if (typeof window !== 'undefined') {
    console.error('Service client should not be used on the client side')
    return null
  }

  if (!serviceClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase URL or service role key')
      return null
    }

    console.log('Creating Supabase service client')

    serviceClient = createClient<Database>(
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

  return serviceClient
}
