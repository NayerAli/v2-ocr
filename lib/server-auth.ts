// Server-side authentication helpers
// IMPORTANT: This file should only be imported in App Router components (app directory)
// It uses next/headers which is not compatible with Pages Router (pages directory)

import type { User, Session } from '@supabase/supabase-js'
import { debugError, middlewareLog } from './log'
import { createClient } from '@/utils/supabase/server'

/**
 * Get the current user session on the server
 *
 * IMPORTANT: This uses getUser() instead of getSession() for security
 * as recommended by Supabase best practices
 */
export async function getServerSession(): Promise<Session | null> {
  try {
    const supabase = await createClient()

    // Use getUser() instead of getSession() for security
    // getUser() always validates the token with the Supabase Auth server
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      debugError('[Server] Error getting user:', error.message)
      return null
    }

    if (data.user) {
      middlewareLog('debug', '[Server] User authenticated:', data.user.email)

      // Get the session to return the full session object
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session) {
        return sessionData.session
      }

      // If we have a user but no session, create a minimal session object
      return {
        user: data.user,
        access_token: '',
        refresh_token: '',
        expires_at: 0,
        expires_in: 0,
        token_type: 'bearer'
      }
    }

    middlewareLog('debug', '[Server-Auth] No authenticated user found')
    return null
  } catch (e) {
    debugError('[Server-Auth] Exception getting session:', e)
    return null
  }
}

/**
 * Get the current user on the server
 *
 * IMPORTANT: This uses getUser() instead of getSession() for security
 * as recommended by Supabase best practices
 */
export async function getServerUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      debugError('[Server] Error getting user:', error.message)
      return null
    }

    if (data.user) {
      middlewareLog('debug', '[Server] User found:', data.user.email)
      return data.user
    }

    middlewareLog('debug', '[Server] No user found')
    return null
  } catch (error) {
    debugError('[Server] Exception getting user:', error)
    return null
  }
}

/**
 * Check if the user is authenticated on the server
 */
export async function isServerAuthenticated(): Promise<boolean> {
  try {
    const user = await getServerUser()
    return !!user
  } catch (error) {
    debugError('[Server] Error checking authentication:', error)
    return false
  }
}
