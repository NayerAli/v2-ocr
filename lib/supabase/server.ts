import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * Creates a Supabase client for server components using the latest SSR approach
 */
export async function createClient() {
  const cookieStore = cookies()
  
  // Custom fetch handler for network errors
  const customFetch = (url: RequestInfo | URL, init?: RequestInit) => {
    return fetch(url, init).catch((err: Error) => {
      console.error('Supabase fetch error:', err)
      // For AggregateError or network errors, implement retry logic
      if (err.name === 'AggregateError' || err.message?.includes('fetch failed')) {
        console.warn('Retrying Supabase request due to network error')
        // Add a small delay before retry to avoid overwhelming the network
        return new Promise(resolve => setTimeout(resolve, 500))
          .then(() => fetch(url, init))
      }
      throw err
    })
  }
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            console.debug('Cookie set failed in server component (expected)', { name })
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // The `remove` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            console.debug('Cookie remove failed in server component (expected)', { name })
          }
        },
      },
      global: {
        fetch: customFetch
      }
    }
  )
}
