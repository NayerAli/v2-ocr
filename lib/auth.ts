import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase/singleton-client'
import { middlewareLog, prodError } from './log'

/**
 * Get the current user session
 */
export async function getSession(): Promise<Session | null> {
  try {
    // Get the singleton Supabase client
    const supabase = getSupabaseClient()
    if (!supabase) return null

    // Try to get the session from Supabase
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      prodError('[Auth] Error getting session:', error.message)
      return null
    }

    if (data.session) {
      middlewareLog('debug', '[Auth] Session found')
      return data.session
    } else {
      middlewareLog('debug', '[Auth] No session found')
      return null
    }
  } catch (error) {
    prodError('[Auth] Exception getting session:', error)
    return null
  }
}

/**
 * Get the current user
 */
export async function getUser(): Promise<User | null> {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) return null

    const { data, error } = await supabase.auth.getUser()

    if (error) {
      prodError('[Auth] Error getting user:', error.message)
      return null
    }

    if (data.user) {
      middlewareLog('debug', '[Auth] User found:', data.user.email)
      return data.user
    }

    middlewareLog('debug', '[Auth] No user found')
    return null
  } catch (error) {
    prodError('[Auth] Exception getting user:', error)
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
