// Server-side authentication helpers
// IMPORTANT: This file should only be imported in App Router components (app directory)
// It uses next/headers which is not compatible with Pages Router (pages directory)

import type { User, Session, SupabaseClient } from '@supabase/supabase-js'
import { middlewareLog, prodError } from './log'
import { createClient } from './supabase/server'
import { verifyAccessToken } from './jwt'

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
 * Retrieve authenticated user with local JWT validation and session refresh
 */
export async function getAuthenticatedUser(
  supabase: SupabaseClient,
  req?: Request
): Promise<User | null> {
  // First, check if user information was forwarded by the middleware
  if (req) {
    const headerUser = req.headers.get('x-user')
    if (headerUser) {
      try {
        const parsed = JSON.parse(decodeURIComponent(headerUser)) as User
        middlewareLog('important', '[Server-Auth] User provided by middleware', {
          email: parsed.email
        })
        return parsed
      } catch (e) {
        prodError('[Server-Auth] Failed to parse user header:', e)
      }
    }
  }

  // Attempt local JWT validation before contacting Supabase
  if (req) {
    const cookieHeader = req.headers.get('cookie') || ''
    const cookies = cookieHeader.split(';').map(c => c.trim())
    const tokenCookie = cookies.find(c => c.startsWith('sb-access-token='))
    if (tokenCookie) {
      const token = tokenCookie.split('=')[1]
      const claims = await verifyAccessToken(token)
      if (claims) {
        middlewareLog('important', '[Server-Auth] User authenticated from JWT', {
          email: claims.email
        })
        return {
          id: claims.id,
          email: claims.email,
          role: claims.role
        } as User
      }
    }
  }

  // Try to get user directly from Supabase
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
