import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase/singleton-client'
import { debugLog, debugError } from './log'

/**
 * Get the current user session
 */
export async function getSession(): Promise<Session | null> {
  try {
    // Get the singleton Supabase client
    const supabase = getSupabaseClient()

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
 */
export async function getUser(): Promise<User | null> {
  try {
    // First try to get the session
    const session = await getSession()
    if (session?.user) {
      return session.user
    }

    // If no session, try to get the user directly
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      debugError('Error getting user:', error.message)
      return null
    }

    return data.user || null
  } catch (error) {
    debugError('Exception getting user:', error)
    return null
  }
}

/**
 * Check if the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return !!session
}
