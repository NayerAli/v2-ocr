import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Returns a Supabase client appropriate for the current runtime.
// - On the server: use the service role client if available, otherwise fall back
//   to the request-agnostic browser client (limited, may hit RLS without auth).
// - On the client: return the shared browser client.
export async function getRuntimeSupabase(): Promise<SupabaseClient<Database> | null> {
  if (typeof window === 'undefined') {
    try {
      const { getServiceClient } = await import('./service-client')
      const svc = getServiceClient()
      if (svc) return svc
    } catch {
      // ignore, fall through
    }
    const { getSupabaseClient } = await import('./singleton-client')
    return (getSupabaseClient() as SupabaseClient<Database> | null)
  }
  const { getSupabaseClient } = await import('./singleton-client')
  return (getSupabaseClient() as SupabaseClient<Database> | null)
}

