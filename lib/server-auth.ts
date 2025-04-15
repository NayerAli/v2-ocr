// Server-side authentication helpers
// IMPORTANT: This file should only be imported in App Router components (app directory)
// It uses next/headers which is not compatible with Pages Router (pages directory)

import { createClient } from '@supabase/supabase-js'
import type { User, Session } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { cookies } from 'next/headers'

/**
 * Create a Supabase client for server-side use
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies()

  // Get all cookies as a string
  const cookieString = cookieStore.toString()

  // Try to extract the auth token directly
  let authToken = null
  try {
    // Look for Supabase auth cookies
    // Get all cookies and find any that match the Supabase auth pattern
    const allCookies = cookieStore.getAll()

    // First try the specific cookie names we know about
    let authCookie = cookieStore.get('sb-auth-token') ||
                    cookieStore.get('sb-localhost:8000-auth-token') ||
                    cookieStore.get('sb-localhost-auth-token') ||
                    cookieStore.get('sb-uvhjupgcggyuopxbirnp-auth-token')

    // If not found, try to find any cookie that matches the pattern
    if (!authCookie) {
      authCookie = allCookies.find(cookie =>
        cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
      )
    }

    console.log('Server-Auth: Found cookies:', allCookies.map(c => c.name))
    if (authCookie) {
      console.log('Server-Auth: Using auth cookie:', authCookie.name)
    }

    if (authCookie) {
      const cookieValue = decodeURIComponent(authCookie.value)

      try {
        const authData = JSON.parse(cookieValue)

        if (authData.access_token) {
          authToken = authData.access_token
        }
      } catch (parseError) {
        console.error('Server-Auth: Error parsing cookie value:', parseError)
      }
    }
  } catch (e) {
    console.error('Server: Error extracting auth token from cookie:', e)
  }

  // Create the Supabase client
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          cookie: cookieString
        }
      }
    }
  )

  // Supabase client created with auth token

  // If we found an auth token, set it directly
  if (authToken) {
    client.auth.setSession({ access_token: authToken, refresh_token: '' })
  }

  return client
}

/**
 * Get the current user session on the server
 */
export async function getServerSession(): Promise<Session | null> {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('[Server] Error getting session:', error.message)
      return null
    }

    if (data.session) {
      console.log('[Server] Session found for user:', data.session.user.email)
      return data.session
    }

    // Try to manually parse the session from cookies as a fallback
    try {
      const cookieStore = cookies()
      const allCookies = cookieStore.getAll()

      // First try the specific cookie names we know about
      let authCookie = cookieStore.get('sb-auth-token') ||
                      cookieStore.get('sb-localhost:8000-auth-token') ||
                      cookieStore.get('sb-localhost-auth-token') ||
                      cookieStore.get('sb-uvhjupgcggyuopxbirnp-auth-token')

      // If not found, try to find any cookie that matches the pattern
      if (!authCookie) {
        authCookie = allCookies.find(cookie =>
          cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
        )
      }

      console.log('[Server-Auth] Found cookies:', allCookies.map(c => c.name))

      if (authCookie) {
        console.log('[Server-Auth] Found auth cookie, attempting to parse')
        const cookieValue = decodeURIComponent(authCookie.value)
        const authData = JSON.parse(cookieValue)

        if (authData.access_token) {
          console.log('[Server-Auth] Manually parsed auth token from cookie')

          // Verify the token
          const { data: userData, error: userError } = await supabase.auth.getUser(authData.access_token)

          if (!userError && userData?.user) {
            console.log('[Server-Auth] Manually verified user from token:', userData.user.email)
            return { user: userData.user, ...authData } as Session
          }
        }
      }
    } catch (e) {
      console.error('[Server-Auth] Error parsing auth cookie')
    }

    console.log('[Server-Auth] No session found')
    return null
  } catch (error) {
    console.error('[Server-Auth] Exception getting session')
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
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      console.error('[Server] Error getting user:', error.message)
      return null
    }

    if (data.user) {
      console.log('[Server] User found:', data.user.email)
      return data.user
    }

    console.log('[Server] No user found')
    return null
  } catch (error) {
    console.error('[Server] Exception getting user:', error)
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
