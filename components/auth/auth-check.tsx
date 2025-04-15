'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { supabase } from '@/lib/supabase-client'
import { debugLog, debugError } from '@/lib/log'

interface AuthCheckProps {
  children: React.ReactNode
  redirectTo?: string
}

/**
 * A component that checks if the user is authenticated on the client side
 * and redirects to the login page if not.
 */
export function AuthCheck({ children, redirectTo = '/auth/login' }: AuthCheckProps) {
  const { user, isLoading } = useAuth()
  const [isVerifying, setIsVerifying] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // Verify authentication

        // First check the auth context
        if (user) {
          // User found in context
          setIsAuthenticated(true)
          setIsVerifying(false)
          return
        }

        // If no user in context, check with Supabase directly
        if (!isLoading) {
          // No user in context, check with Supabase directly
          const { data, error } = await supabase.auth.getSession()

          if (error) {
            debugError('[DEBUG] AuthCheck: Error getting session:', error.message)
            setIsAuthenticated(false)
          } else if (data.session) {
            // Session found
            setIsAuthenticated(true)
          } else {
            // No session found from Supabase
            // Try to refresh the session
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

              if (refreshError) {
                debugError('[DEBUG] AuthCheck: Error refreshing session:', refreshError.message)
                setIsAuthenticated(false)
              } else if (refreshData.session) {
                debugLog('[DEBUG] AuthCheck: Session refreshed for user:', refreshData.session.user.email)
                setIsAuthenticated(true)
              } else {
                debugLog('[DEBUG] AuthCheck: No session after refresh attempt')
                setIsAuthenticated(false)
              }
            } catch (refreshException) {
              debugError('[DEBUG] AuthCheck: Exception refreshing session:', refreshException)
              setIsAuthenticated(false)
            }
          }

          setIsVerifying(false)
        }
      } catch (error) {
        debugError('AuthCheck: Error verifying authentication:', error)
        setIsAuthenticated(false)
        setIsVerifying(false)
      }
    }

    verifyAuth()

    // Also check localStorage directly as a fallback
    if (typeof window !== 'undefined') {
      const hasAuthToken = !!localStorage.getItem('sb-auth-token') ||
                          !!localStorage.getItem(`sb-${window.location.hostname}-auth-token`);

      if (hasAuthToken) {
        debugLog('AuthCheck: Auth token found in localStorage')
        // If we have a token but no user yet, wait for the auth state to update
        if (!user && isLoading) {
          debugLog('AuthCheck: Waiting for auth state to update...')
        } else if (!user && !isLoading) {
          debugLog('AuthCheck: Auth token exists but no user, forcing refresh')
          // Force a refresh of the auth state
          supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
              debugLog('AuthCheck: Session refreshed for user:', data.session.user.email)
              setIsAuthenticated(true)
              setIsVerifying(false)
            }
          })
        }
      }
    }
  }, [user, isLoading])

  useEffect(() => {
    // Redirect if not authenticated and not still verifying
    if (!isVerifying && !isAuthenticated) {
      debugLog('AuthCheck: Not authenticated, redirecting to:', redirectTo)
      const fullRedirectUrl = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`
      router.push(fullRedirectUrl)
    }
  }, [isVerifying, isAuthenticated, redirectTo, router])

  // Show loading state while verifying
  if (isVerifying || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Show children if authenticated
  return isAuthenticated ? <>{children}</> : null
}
