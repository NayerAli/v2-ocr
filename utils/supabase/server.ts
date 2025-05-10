import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Create a Supabase client for server-side that properly handles cookies
 */
export function createClient() {
  const cookieStore = cookies()

  // Ensure we have a stable environment for the cookie store
  if (!cookieStore) {
    console.error('Cookie store is not available in the current context')
    throw new Error('Cookie store unavailable')
  }
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => {
          try {
            const cookie = cookieStore.get(name)
            return cookie?.value
          } catch (e) {
            console.error(`Error getting cookie ${name}:`, e)
            return undefined
          }
        },
        set: (name, value, options) => {
          try {
            // Use a more robust approach for setting cookies
            cookieStore.set({
              name,
              value,
              ...options,
              path: options.path || '/',
              sameSite: options.sameSite || 'lax',
              secure: process.env.NODE_ENV === 'production',
              httpOnly: true
            })
          } catch (error) {
            console.error(`Error setting cookie ${name}:`, error)
          }
        },
        remove: (name, options) => {
          try {
            cookieStore.set({
              name,
              value: '',
              ...options,
              path: options.path || '/',
              maxAge: 0,
              expires: new Date(0)
            })
          } catch (error) {
            console.error(`Error removing cookie ${name}:`, error)
          }
        }
      }
    }
  )
}
