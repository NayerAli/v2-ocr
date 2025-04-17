'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/singleton-client'
import { debugLog, debugError } from '@/lib/log'

type AuthContextType = {
  user: User | null
  session: Session | null
  isLoading: boolean
  signIn: (email: string, password: string, redirectTo?: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = getSupabaseClient()

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      setIsLoading(true)

      try {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          debugError('Auth Provider: Error getting session:', error.message)
          setSession(null)
          setUser(null)
          setIsLoading(false)
          return
        }

        setSession(data.session)
        setUser(data.session?.user ?? null)

        if (data.session?.user) {
          debugLog('Auth Provider: User authenticated:', data.session.user.email)
          debugLog('Auth Provider: Session expires at:', new Date(data.session.expires_at! * 1000).toLocaleString())
        } else {
          debugLog('Auth Provider: No authenticated user')

          // Try to refresh the session
          debugLog('Auth Provider: Attempting to refresh session')
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

          if (refreshError) {
            debugError('Auth Provider: Error refreshing session:', refreshError.message)
          } else if (refreshData.session) {
            debugLog('Auth Provider: Session refreshed for user:', refreshData.session.user.email)
            setSession(refreshData.session)
            setUser(refreshData.session.user)
          }
        }
      } catch (error) {
        debugError('Auth Provider: Exception getting session:', error)
        setSession(null)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        debugLog('Auth Provider: Auth state changed:', event)

        if (event === 'SIGNED_IN') {
          debugLog('Auth Provider: User signed in:', session?.user?.email)
          setSession(session)
          setUser(session?.user ?? null)
        } else if (event === 'SIGNED_OUT') {
          debugLog('Auth Provider: User signed out')
          setSession(null)
          setUser(null)
          router.push('/auth/login')
        } else if (event === 'TOKEN_REFRESHED') {
          debugLog('Auth Provider: Token refreshed for user:', session?.user?.email)
          setSession(session)
          setUser(session?.user ?? null)
        } else if (event === 'USER_UPDATED') {
          debugLog('Auth Provider: User updated:', session?.user?.email)
          setSession(session)
          setUser(session?.user ?? null)
        } else {
          debugLog('Auth Provider: Other auth event:', event)
          setSession(session)
          setUser(session?.user ?? null)
        }

        setIsLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase.auth])

  const signIn = async (email: string, password: string, redirectTo: string = '/') => {
    try {
      setIsLoading(true)
      debugLog('Auth Provider: Attempting to sign in:', email)

      // Sign in with password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      // Set up redirect after successful sign-in
      await supabase.auth.setSession({
        access_token: data?.session?.access_token || '',
        refresh_token: data?.session?.refresh_token || ''
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

        // Log session details
        if (data.session) {
          debugLog('Auth Provider: Session expires at:', new Date(data.session.expires_at! * 1000).toLocaleString())
          debugLog('Auth Provider: Access token:', data.session.access_token ? 'Present' : 'Missing')

          // Manually set the cookie to ensure it's available for server-side requests
          // This is a critical step to ensure the middleware can detect the session
          if (typeof document !== 'undefined') {
            const cookieValue = JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at
            })

            // Set the cookie with appropriate options
            document.cookie = `sb-auth-token=${encodeURIComponent(cookieValue)};path=/;max-age=${60 * 60 * 24 * 7};SameSite=Lax`

            // Also set the project-specific cookie name that Supabase might use
            const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
            if (projectId) {
              document.cookie = `sb-${projectId}-auth-token=${encodeURIComponent(cookieValue)};path=/;max-age=${60 * 60 * 24 * 7};SameSite=Lax`
            }

            debugLog('Auth Provider: Cookies manually set')
          }

          // Verify the session was stored
          if (typeof window !== 'undefined') {
            const localStorageKeys = Object.keys(localStorage)
            debugLog('Auth Provider: LocalStorage keys:', localStorageKeys)

            // Check if we can retrieve the session again
            const { data: sessionData } = await supabase.auth.getSession()
            debugLog('Auth Provider: Session verification:', !!sessionData.session)
          }
        }

        debugLog('Auth Provider: Redirecting to:', redirectTo)

        // Force a small delay to ensure the session is properly established
        setTimeout(() => {
          router.push(redirectTo)
        }, 1000)
      } else {
        debugError('Auth Provider: Sign in returned no user')
        throw new Error('Sign in failed - no user returned')
      }
    } catch (error) {
      debugError('Auth Provider: Error signing in:', error)
      throw error
    } finally {
      setIsLoading(false)
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
      const { error: signInError } = await supabase.auth.signInWithPassword({
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
      const { error } = await supabase.auth.signOut()

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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
    signIn,
    signUp,
    signOut,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
