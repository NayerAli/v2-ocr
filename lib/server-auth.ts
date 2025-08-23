// Server-side authentication helpers
// IMPORTANT: This file should only be imported in App Router components (app directory)
// It uses next/headers which is not compatible with Pages Router (pages directory)

import type { User, Session, SupabaseClient } from '@supabase/supabase-js'
import { middlewareLog, prodError } from './log'
import { createClient } from './supabase/server'

/**
 * Create a Supabase client for server-side use
 */
export async function createServerSupabaseClient() {
  // Create the Supabase client with SSR configuration
  const supabase = await createClient()
  
  return supabase
}

/**
 * Get the current user session on the server
 */
export async function getServerSession(): Promise<Session | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      prodError('[Server] Error getting session:', error.message)
      return null
    }

    if (data.session) {
      middlewareLog('important', '[Server] Session found')
      return data.session
    }

    middlewareLog('important', '[Server-Auth] No session found')
    return null
  } catch (e) {
    prodError('[Server-Auth] Exception getting session', e)
    return null
  }
}

/**
 * Get the current user on the server
 */
export async function getServerUser(): Promise<User | null> {
  try {
    const supabase = await createServerSupabaseClient()
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
 * Retrieve authenticated user with session refresh and cookie fallback
 */
export async function getAuthenticatedUser(
  supabase: SupabaseClient,
  req?: Request
): Promise<User | null> {
  // Try to get user directly
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userData?.user) {
    middlewareLog('important', '[Server-Auth] User authenticated from getUser', {
      email: userData.user.email
    })
    return userData.user
  }

  if (userError) {
    prodError('[Server-Auth] Error getting user:', userError.message)
  }

  // Attempt to refresh session and retry
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    prodError('[Server-Auth] Session error:', sessionError.message)
  }

  if (sessionData?.session) {
    middlewareLog('important', '[Server-Auth] Retrying user fetch after session retrieval')
    const { data: verifiedUser, error: verifyError } = await supabase.auth.getUser()

    if (verifiedUser.user) {
      middlewareLog('important', '[Server-Auth] User verified after session fetch', {
        email: verifiedUser.user.email
      })
      return verifiedUser.user
    }

    if (verifyError) {
      prodError('[Server-Auth] Error verifying user:', verifyError.message)
    }
  }

  // Fallback: attempt to extract user from cookies
  if (req) {
    try {
      const cookieHeader = req.headers.get('cookie') || ''
      const cookies = cookieHeader.split(';').map(c => c.trim())

      const authCookie = cookies.find(c =>
        c.startsWith('sb-auth-token=') ||
        c.startsWith('sb-localhost:8000-auth-token=') ||
        c.includes('-auth-token=')
      )

      if (authCookie) {
        const tokenValue = authCookie.split('=')[1]
        if (tokenValue) {
          try {
            const tokenData = JSON.parse(decodeURIComponent(tokenValue))
            if (tokenData.access_token) {
              const { data: manualSessionData, error: manualSessionError } =
                await supabase.auth.setSession({
                  access_token: tokenData.access_token,
                  refresh_token: tokenData.refresh_token || ''
                })

              if (manualSessionData?.user) {
                middlewareLog('important', '[Server-Auth] User authenticated from manual token', {
                  email: manualSessionData.user.email
                })
                return manualSessionData.user
              }

              if (manualSessionError) {
                prodError('[Server-Auth] Error setting manual session:', manualSessionError.message)
              }
            }
          } catch (parseError) {
            prodError('[Server-Auth] Error parsing auth token:', parseError as Error)
          }
        }
      }
    } catch (cookieError) {
      prodError('[Server-Auth] Error extracting user from cookies:', cookieError as Error)
    }
  }

  middlewareLog('important', '[Server-Auth] No authenticated user found')
  return null
}

/**
 * Check if the user is authenticated on the server
 */
export async function isServerAuthenticated(): Promise<boolean> {
  const session = await getServerSession()
  return !!session
}
