'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Session } from '@supabase/supabase-js'
import { debugLog, debugError } from '@/lib/log'
import { createClient } from '@/utils/supabase/client'
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import { SessionContextProvider } from '@supabase/auth-helpers-react'

type AuthContextType = {
  user: User | null
  session: Session | null
  isLoading: boolean
  hasInvalidToken: boolean
  signIn: (email: string, password: string, redirectTo?: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasInvalidToken, setHasInvalidToken] = useState(false)
  const router = useRouter()

  // Use createClient from our singleton instead of creating a new instance
  const supabaseClient = useMemo(() => createClient(), [])

  // Verify token validity with server
  const verifyAuthToken = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include',
        cache: 'no-cache'
      })

      if (!response.ok) {
        debugLog('Auth Provider: Token verification failed')
        setHasInvalidToken(true)
        return false
      }

      const data = await response.json()
      return data.authenticated
    } catch (error) {
      debugError('Auth Provider: Error verifying token:', error)
      setHasInvalidToken(true)
      return false
    }
  }

  // Clean up invalid auth cookies
  const cleanupInvalidTokens = async () => {
    if (!hasInvalidToken) return

    try {
      debugLog('Auth Provider: Cleaning up invalid auth tokens')
      const response = await fetch('/api/auth/cleanup', {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        debugLog('Auth Provider: Cleaned up cookies:', data.cookies_cleaned)

        // Reset hasInvalidToken after cleanup
        setHasInvalidToken(false)

        // Force sign out if we had a user object still
        if (user) {
          debugLog('Auth Provider: Signing out user after token cleanup')
          await supabaseClient.auth.signOut()
          setUser(null)
          setSession(null)
        }
      }
    } catch (error) {
      debugError('Auth Provider: Error cleaning up tokens:', error)
    }
  }

  // Get initial session
  const getInitialSession = useCallback(async () => {
    setIsLoading(true)

    try {
      const { data, error } = await supabaseClient.auth.getSession()

      if (error) {
        debugError('Auth Provider: Error getting session:', error.message)
        setSession(null)
        setUser(null)
        setIsLoading(false)

        // Check for invalid token state
        if (document.cookie.includes('-auth-token=')) {
          debugLog('Auth Provider: Auth cookie found but session error, verifying token')
          await verifyAuthToken()
        }
        return
      }

      setSession(data.session)
      setUser(data.session?.user ?? null)

      if (data.session?.user) {
        debugLog('Auth Provider: User authenticated:', data.session.user.email)
        debugLog('Auth Provider: Session expires at:', new Date(data.session.expires_at! * 1000).toLocaleString())

        // Persist session in localStorage for redundancy
        try {
          localStorage.setItem('supabase-auth-user', JSON.stringify(data.session.user))
        } catch (e) {
          debugError('Auth Provider: Failed to store user in localStorage', e)
        }

        // Verify token validity with server
        await verifyAuthToken()
      } else {
        debugLog('Auth Provider: No authenticated user')

        // If we have auth cookies but no session, the cookies are likely invalid
        if (document.cookie.includes('-auth-token=')) {
          debugLog('Auth Provider: Auth cookie found but no session, verifying token')
          await verifyAuthToken()
        }

        // Try to refresh the session
        debugLog('Auth Provider: Attempting to refresh session')
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession()

        if (refreshError) {
          debugError('Auth Provider: Error refreshing session:', refreshError.message)
          // If refresh fails and we have cookies, tokens are likely invalid
          if (document.cookie.includes('-auth-token=')) {
            setHasInvalidToken(true)
          }
        } else if (refreshData.session) {
          debugLog('Auth Provider: Session refreshed for user:', refreshData.session.user.email)
          setSession(refreshData.session)
          setUser(refreshData.session.user)
          setHasInvalidToken(false)

          // Store refreshed user
          try {
            localStorage.setItem('supabase-auth-user', JSON.stringify(refreshData.session.user))
          } catch (e) {
            debugError('Auth Provider: Failed to store refreshed user in localStorage', e)
          }
        }
      }
    } catch (error) {
      debugError('Auth Provider: Exception getting session:', error)
      setSession(null)
      setUser(null)

      // Check for invalid token state
      if (document.cookie.includes('-auth-token=')) {
        setHasInvalidToken(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [supabaseClient.auth])

  // Initialize auth state
  useEffect(() => {
    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      debugLog('Auth Provider: Auth state changed:', event)

      if (event === 'SIGNED_IN') {
        debugLog('Auth Provider: User signed in:', session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        setHasInvalidToken(false)

        // Force a cookie refresh after sign-in
        try {
          const response = await fetch('/api/auth/set-cookies', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event,
              session,
            }),
          });

          if (!response.ok) {
            debugLog('Auth Provider: Failed to set cookies via API:', response.status, response.statusText);
          }
        } catch (error) {
          debugError('Auth Provider: Error setting cookies:', error);
        }

        // Store user in localStorage
        if (session?.user) {
          try {
            localStorage.setItem('supabase-auth-user', JSON.stringify(session.user))
          } catch (e) {
            debugError('Auth Provider: Failed to store user in localStorage', e)
          }
        }
      } else if (event === 'SIGNED_OUT') {
        debugLog('Auth Provider: User signed out')
        setSession(null)
        setUser(null)
        setHasInvalidToken(false)

        // Clear stored user
        try {
          localStorage.removeItem('supabase-auth-user')
        } catch (e) {
          debugError('Auth Provider: Failed to remove user from localStorage', e)
        }

        router.push('/auth/login')
      } else if (event === 'TOKEN_REFRESHED') {
        debugLog('Auth Provider: Token refreshed for user:', session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        setHasInvalidToken(false)

        // Update stored user
        if (session?.user) {
          try {
            localStorage.setItem('supabase-auth-user', JSON.stringify(session.user))
          } catch (e) {
            debugError('Auth Provider: Failed to update user in localStorage', e)
          }
        }
      } else if (event === 'USER_UPDATED') {
        debugLog('Auth Provider: User updated:', session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        setHasInvalidToken(false)

        // Update stored user
        if (session?.user) {
          try {
            localStorage.setItem('supabase-auth-user', JSON.stringify(session.user))
          } catch (e) {
            debugError('Auth Provider: Failed to update user in localStorage', e)
          }
        }
      } else {
        debugLog('Auth Provider: Other auth event:', event)
        setSession(session)
        setUser(session?.user ?? null)

        // Update stored user if present
        if (session?.user) {
          try {
            localStorage.setItem('supabase-auth-user', JSON.stringify(session.user))
          } catch (e) {
            debugError('Auth Provider: Failed to update user in localStorage', e)
          }
        }
      }

      setIsLoading(false)
    })

    // Clean up invalid tokens when detected
    if (hasInvalidToken) {
      cleanupInvalidTokens()
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [getInitialSession, supabaseClient.auth, router, hasInvalidToken])

  const signIn = async (email: string, password: string, redirectTo: string = '/') => {
    try {
      setIsLoading(true)
      debugLog('Auth Provider: Attempting to sign in:', email)

      // Sign in with password
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        debugError('Auth Provider: Sign in error:', error.message)
        throw error
      }

      if (data?.user) {
        debugLog('Auth Provider: Sign in successful for user:', data.user.email)
        debugLog('Auth Provider: Session established:', !!data.session)

        // Set the session and user in state
        setSession(data.session)
        setUser(data.user)

        // Persist the auth session in localStorage
        try {
          localStorage.setItem('supabase-auth-user', JSON.stringify(data.user))
          localStorage.setItem('supabase-auth-state', 'authenticated')
          localStorage.setItem('supabase-auth-last-signin', new Date().toISOString())
        } catch (e) {
          debugError('Auth Provider: Failed to store auth state in localStorage', e)
        }

        // Log session details
        if (data.session) {
          debugLog('Auth Provider: Session expires at:', new Date(data.session.expires_at! * 1000).toLocaleString())
          debugLog('Auth Provider: Access token:', data.session.access_token ? 'Present' : 'Missing')

          // Force cookies to be set properly by using the session_api
          try {
            debugLog('Auth Provider: Setting auth cookies via API')
            // Use window.location.origin to ensure we're using the correct port
            const apiUrl = `${window.location.origin}/api/auth/set-cookies`;
            debugLog('Auth Provider: Using API URL:', apiUrl);

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                event: 'SIGNED_IN',
                session: data.session,
              }),
            })

            if (response.ok) {
              debugLog('Auth Provider: Cookies set successfully')
            } else {
              debugLog('Auth Provider: Failed to set cookies via API:', response.status, response.statusText)
            }
          } catch (cookieError) {
            debugError('Auth Provider: Error setting cookies:', cookieError)
          }

          // Double-check the session
          const { data: sessionData } = await supabaseClient.auth.getSession();
          debugLog('Auth Provider: Session verification:', !!sessionData.session);
        }

        debugLog('Auth Provider: Login successful, ready for redirect to:', redirectTo);

        // We'll let the login form handle the redirect to ensure cookies are properly set
        return;
      } else {
        debugError('Auth Provider: Sign in returned no user');
        throw new Error('Sign in failed - no user returned');
      }
    } catch (error) {
      debugError('Auth Provider: Error signing in:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      setIsLoading(true)
      debugLog('[DEBUG] Auth Provider: Attempting to sign up user:', email)

      // Use our custom API endpoint to create the user without email confirmation
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        debugError('[DEBUG] Auth Provider: API signup error:', data.error)
        throw new Error(data.error || 'Failed to create user')
      }

      debugLog('[DEBUG] Auth Provider: User created successfully:', data.user.id)

      // Now sign in with the created user
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) {
        debugError('[DEBUG] Auth Provider: Auto sign-in failed after signup:', signInError.message)
        // Even if sign-in fails, the account was created, so redirect to login
        router.push('/auth/login?registered=true')
        return
      }

      debugLog('[DEBUG] Auth Provider: Auto sign-in successful after signup')
      router.push('/')
    } catch (error) {
      debugError('[DEBUG] Auth Provider: Error signing up:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setIsLoading(true)
      const { error } = await supabaseClient.auth.signOut()

      if (error) {
        throw error
      }

      router.push('/auth/login')
    } catch (error) {
      debugError('Error signing out:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const resetPassword = async (email: string) => {
    try {
      setIsLoading(true)
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        throw error
      }
    } catch (error) {
      debugError('Error resetting password:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const value = {
    user,
    session,
    isLoading,
    hasInvalidToken,
    signIn,
    signUp,
    signOut,
    resetPassword,
  }

  return (
    <SessionContextProvider supabaseClient={supabaseClient}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </SessionContextProvider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
