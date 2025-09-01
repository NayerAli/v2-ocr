'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase-client'
import { middlewareLog, prodError } from '@/lib/log'

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
  if (!supabase) {
    throw new Error('Supabase client is not configured')
  }

  // `supabase` is guaranteed to be defined above
  const supabaseClient = supabase!
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      setIsLoading(true)

      try {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession()

        if (sessionError) {
          prodError('[Auth Provider] Error getting session:', sessionError.message)
          setSession(null)
          setUser(null)
          setIsLoading(false)
          return
        }

        setSession(sessionData.session)
        setUser(sessionData.session?.user ?? null)

        if (sessionData.session?.user) {
          middlewareLog('important', '[Auth Provider] User authenticated:', sessionData.session.user.email)
          middlewareLog('debug', '[Auth Provider] Session expires at:', new Date(sessionData.session.expires_at! * 1000).toLocaleString())
        } else {
          middlewareLog('debug', '[Auth Provider] No authenticated user')

          // Try to refresh the session
          middlewareLog('debug', '[Auth Provider] Attempting to refresh session')
          const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession()

          if (refreshError) {
            prodError('[Auth Provider] Error refreshing session:', refreshError.message)
          } else if (refreshData.session) {
            middlewareLog('debug', '[Auth Provider] Session refreshed for user:', refreshData.session.user?.email)
            setSession(refreshData.session)
            setUser(refreshData.session.user ?? null)
          }
        }
      } catch (error) {
        prodError('[Auth Provider] Exception getting session:', error)
        setSession(null)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        middlewareLog('debug', '[Auth Provider] Auth state changed:', event)

        if (event === 'SIGNED_OUT') {
          middlewareLog('important', '[Auth Provider] User signed out')
          setSession(null)
          setUser(null)
          router.push('/auth/login')
        } else {
          setSession(session)
          setUser(session?.user ?? null)

          if (event === 'SIGNED_IN') {
            middlewareLog('important', '[Auth Provider] User signed in:', session?.user?.email)
          } else if (event === 'TOKEN_REFRESHED') {
            middlewareLog('debug', '[Auth Provider] Token refreshed for user:', session?.user?.email)
          } else if (event === 'USER_UPDATED') {
            middlewareLog('debug', '[Auth Provider] User updated:', session?.user?.email)
          } else {
            middlewareLog('debug', '[Auth Provider] Other auth event:', event)
          }
        }

        setIsLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async (email: string, password: string, redirectTo: string = '/documents') => {
    try {
      setIsLoading(true)
      middlewareLog('important', '[Auth Provider] Attempting to sign in:', email)

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        prodError('[Auth Provider] Sign in error:', error.message)
        throw error
      }

      if (data?.user) {
        setSession(data.session)
        setUser(data.user)
        middlewareLog('important', '[Auth Provider] Redirecting to:', redirectTo)
        router.replace(redirectTo)
        router.refresh()
      } else {
        prodError('[Auth Provider] Sign in returned no user')
        throw new Error('Sign in failed - no user returned')
      }
    } catch (error) {
      prodError('[Auth Provider] Error signing in:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      setIsLoading(true)
      middlewareLog('important', '[Auth Provider] Attempting to sign up user:', email)

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
        prodError('[Auth Provider] API signup error:', data.error)
        throw new Error(data.error || 'Failed to create user')
      }

      middlewareLog('important', '[Auth Provider] User created successfully:', data.user.id)

      // Now sign in with the created user
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) {
        prodError('[Auth Provider] Auto sign-in failed after signup:', signInError.message)
        // Even if sign-in fails, the account was created, so redirect to login
        router.push('/auth/login?registered=true')
        return
      }

      middlewareLog('important', '[Auth Provider] Auto sign-in successful after signup')
      router.push('/')
    } catch (error) {
      prodError('[Auth Provider] Error signing up:', error)
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
      prodError('[Auth Provider] Error signing out:', error)
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
      prodError('[Auth Provider] Error resetting password:', error)
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
    return {
      user: null,
      session: null,
      isLoading: true,
      signIn: async () => { throw new Error('AuthProvider is not mounted') },
      signUp: async () => { throw new Error('AuthProvider is not mounted') },
      signOut: async () => { throw new Error('AuthProvider is not mounted') },
      resetPassword: async () => { throw new Error('AuthProvider is not mounted') },
    }
  }

  return context
}
