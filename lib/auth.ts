import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase/singleton-client'

// Get the singleton Supabase client
const supabase = getSupabaseClient()

/**
 * Get the current user session
 */
export async function getSession(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session
  } catch (error) {
    // Silently handle auth errors (expected when not logged in)
    return null
  }
}

/**
 * Get the current user
 */
export async function getUser(): Promise<User | null> {
  try {
    const { data } = await supabase.auth.getUser()
    return data.user
  } catch (error) {
    // Silently handle auth errors (expected when not logged in)
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
