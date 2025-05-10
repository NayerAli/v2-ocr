import type { User, Session } from '@supabase/supabase-js'
import { debugLog, debugError } from './log'
import { createClient } from '@/utils/supabase/client'

/**
 * Get the current user session
 *
 * Note: For security-critical operations, prefer using getUser() instead
 * as it always validates the token with the Supabase Auth server
 */
export async function getSession(): Promise<Session | null> {
  try {
    // Create a Supabase client using our utility function
    const supabase = createClient()

    // Try to get the session from Supabase
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      debugError('Error getting session:', error.message)
      return null
    }

    if (data.session) {
      debugLog('Session found for user:', data.session.user.email)
      return data.session
    } else {
      debugLog('No session found')
      return null
    }
  } catch (error) {
    debugError('Exception getting session:', error)
    return null
  }
}

/**
 * Get the current user
 *
 * This is the preferred method for checking authentication as it
 * always validates the token with the Supabase Auth server
 */
export async function getUser(): Promise<User | null> {
  try {
    // Create a Supabase client using our utility function
    const supabase = createClient()

    // Get the user directly using getUser() for security
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      debugError('Error getting user:', error.message)
      return null
    }

    if (data.user) {
      debugLog('User found:', data.user.email)
    } else {
      debugLog('No user found')
    }

    return data.user || null
  } catch (error) {
    debugError('Exception getting user:', error)
    return null
  }
}

/**
 * Check if the user is authenticated
 *
 * This uses getUser() for security as it always validates
 * the token with the Supabase Auth server
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getUser()
  return !!user
}

// Interface for authenticated user
export interface AuthUser {
  id: string
  email?: string
  role?: string
}

// Note: Server-side auth utilities have been moved to lib/auth.server.ts
