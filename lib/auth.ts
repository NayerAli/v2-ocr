import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase/singleton-client'

// Get the singleton Supabase client
const supabase = getSupabaseClient()

/**
 * Get the current user session
 */
export async function getSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('Error getting session:', error.message)
      return null
    }

    if (data.session) {
      console.log('Session found for user:', data.session.user.email)
    } else {
      console.log('No session found')
    }

    return data.session
  } catch (error) {
    console.error('Exception getting session:', error)
    return null
  }
}

/**
 * Get the current user
 */
export async function getUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      console.error('Error getting user:', error.message)
      return null
    }

    if (data.user) {
      console.log('User found:', data.user.email)
    } else {
      console.log('No user found')
    }

    return data.user
  } catch (error) {
    console.error('Exception getting user:', error)
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
