// Server-side authentication helpers
// IMPORTANT: This file should only be imported in App Router components (app directory)
// It uses next/headers which is not compatible with Pages Router (pages directory)

import type { User, SupabaseClient } from '@supabase/supabase-js'
import { middlewareLog, prodError } from './log'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * Create a Supabase client for server-side use
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies()

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
            console.debug('Cookie set failed in server component (expected)', { name })
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            console.debug('Cookie remove failed in server component (expected)', { name })
          }
        }
      }
    }
  )
}

/**
 * Get the current user on the server
 */
export async function getServerUser(): Promise<User | null> {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      prodError('[Server] Error getting user:', error.message)
      return null
    }

    if (data.user) {
      middlewareLog('important', '[Server] User found:', data.user.email)
      return data.user
    }

    middlewareLog('important', '[Server] No user found')
    return null
  } catch (e) {
    prodError('[Server] Exception getting user', e)
    return null
  }
}

/**
 * Retrieve authenticated user with local JWT validation and session refresh
 */
export async function getAuthenticatedUser(
  supabase: SupabaseClient
): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser()

    if (data?.user) {
      middlewareLog('important', '[Server-Auth] User authenticated from getUser', {
        email: data.user.email
      })
      return data.user
    }

    if (error) {
      prodError('[Server-Auth] Error getting user:', error.message)
    }

    middlewareLog('important', '[Server-Auth] No authenticated user found')
    return null
  } catch (e) {
    prodError('[Server-Auth] Exception getting user', e)
    return null
  }
}

/**
 * Check if the user is authenticated on the server
 */
export async function isServerAuthenticated(): Promise<boolean> {
  const user = await getServerUser()
  return !!user
}
