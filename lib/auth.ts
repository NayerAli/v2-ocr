import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase/singleton-client'
import { debugLog, debugError } from './log'

// Server-side auth functions are imported lazily to avoid bundling them for the client
let getServerSession: (() => Promise<Session | null>) | null = null
let getServerUser: (() => Promise<User | null>) | null = null
if (typeof window === 'undefined') {
  const serverAuth = require('./server-auth')
  getServerSession = serverAuth.getServerSession
  getServerUser = serverAuth.getServerUser
}

/**
 * Get the current user session
 */
export async function getSession(): Promise<Session | null> {
  try {
    if (typeof window === 'undefined' && getServerSession) {
      return await getServerSession()
    }

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
    if (typeof window === 'undefined' && getServerUser) {
      return await getServerUser()
    }

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
