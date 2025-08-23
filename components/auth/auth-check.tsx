'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { middlewareLog } from '@/lib/log'

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
    if (user) {
      setIsAuthenticated(true)
      setIsVerifying(false)
    } else if (!isLoading) {
      middlewareLog('debug', '[AuthCheck] No user in context')
      setIsAuthenticated(false)
      setIsVerifying(false)
    }
  }, [user, isLoading])

  useEffect(() => {
    // Redirect if not authenticated and not still verifying
    if (!isVerifying && !isAuthenticated) {
      middlewareLog('important', '[AuthCheck] Not authenticated, redirecting to:', redirectTo)
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
