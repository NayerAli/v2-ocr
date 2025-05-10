'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { debugLog, debugError } from '@/lib/log'
import { createClient } from '@/utils/supabase/client'
import { useSession } from '@supabase/auth-helpers-react'

interface AuthCheckProps {
  children: React.ReactNode
  redirectTo?: string
}

/**
 * A component that checks if the user is authenticated on the client side
 * and redirects to the login page if not.
 *
 * NOTE: This component should only be used as a fallback for server-side authentication.
 * Prefer using server components with getUser() for authentication checks.
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
          // Create a Supabase client using our utility function
          const supabase = createClient()

          // Use getUser() instead of getSession() for security
          const { data, error } = await supabase.auth.getUser()

          if (error) {
            debugError('[DEBUG] AuthCheck: Error getting user:', error.message)
            setIsAuthenticated(false)
          } else if (data.user) {
            // User found
            debugLog('[DEBUG] AuthCheck: User found:', data.user.email)
            setIsAuthenticated(true)
          } else {
            // No user found from Supabase
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
  }, [user, isLoading])

  useEffect(() => {
    // Redirect if not authenticated and not still verifying
    if (!isVerifying && !isAuthenticated) {
      debugLog('AuthCheck: Not authenticated, redirecting to:', redirectTo)

      // Get the current path for the redirect
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/'
      const fullRedirectUrl = `${redirectTo}?redirect=${encodeURIComponent(currentPath)}`

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
