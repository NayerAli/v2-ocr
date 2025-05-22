// Server-side authentication helpers
// IMPORTANT: This file should only be imported in App Router components (app directory)
// It uses next/headers which is not compatible with Pages Router (pages directory)

import type { User, Session } from '@supabase/supabase-js'
import { debugError, middlewareLog } from './log'
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
      debugError('[Server] Error getting session:', error.message)
      return null
    }

    if (data.session) {
      middlewareLog('debug', '[Server] Session found for user:', data.session.user.email)
      return data.session
    }

    middlewareLog('debug', '[Server-Auth] No session found')
    return null
  } catch (e) {
    debugError('[Server-Auth] Exception getting session', e)
    return null
  }
}

/**
 * Get the current user on the server
 */
export async function getServerUser(): Promise<User | null> {
  try {
    // First try to get the session
    const session = await getServerSession()
    if (session?.user) {
      return session.user
    }

    // If no session, try to get the user directly
    const supabase = await createServerSupabaseClient()
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
  } catch (e) {
    debugError('[Server] Exception getting user', e)
    return null
  }
}

/**
 * Check if the user is authenticated on the server
 */
export async function isServerAuthenticated(): Promise<boolean> {
  const session = await getServerSession()
  return !!session
}
