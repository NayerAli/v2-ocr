/**
 * Auth compatibility layer that works in both pages/ and app/ directories
 * This file provides auth utilities that work in both client and server contexts
 */

// No need to import User type as we're using our own AuthUser interface
import { createClient as createClientBrowser } from '@/utils/supabase/client'
import { getUser as getUserClient } from '@/lib/auth'

// Interface for authenticated user (compatible with auth.server.ts)
export interface AuthUser {
  id: string
  email?: string
  role?: string
}

/**
 * Get the currently authenticated user in a way that works in both client and server contexts
 * This is a compatibility layer that doesn't use next/headers
 */
export async function getCompatUser(): Promise<AuthUser | null> {
  try {
    // Try to get the user using the client method first
    const user = await getUserClient()

    if (user) {
      return {
        id: user.id,
        email: user.email,
        role: user.role
      }
    }

    // If client method fails, try a direct approach with getSession first
    const supabase = createClientBrowser()

    // First try getSession which is more reliable in some contexts
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionData?.session?.user) {
      return {
        id: sessionData.session.user.id,
        email: sessionData.session.user.email,
        role: sessionData.session.user.role
      }
    }

    if (sessionError) {
      console.log('[DEBUG] Error getting session in compat layer:', sessionError.message)
      // Continue to try getUser as a fallback
    }

    // If getSession fails, try getUser as a last resort
    const { data, error } = await supabase.auth.getUser()

    if (error || !data?.user) {
      console.log('[DEBUG] Error getting user in compat layer:', error?.message)
      return null
    }

    return {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role
    }
  } catch (error) {
    console.error('[DEBUG] Exception getting user in compat layer:', error)
    return null
  }
}

/**
 * Check if a user is authenticated
 * Works in both client and server contexts
 */
export async function isCompatAuthenticated(): Promise<boolean> {
  const user = await getCompatUser()
  return !!user
}

/**
 * Compatibility auth object that mimics auth.server.ts but works everywhere
 */
export const authCompat = {
  getUser: getCompatUser,
  isAuthenticated: isCompatAuthenticated
}
