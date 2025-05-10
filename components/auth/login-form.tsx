'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from './auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { signIn, isLoading } = useAuth()
  const searchParams = useSearchParams()
  const registered = searchParams.get('registered')
  const errorParam = searchParams.get('error')
  const redirectTo = searchParams.get('redirect')

  // Set error from URL parameter if present
  useEffect(() => {
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [errorParam])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      console.log('Login Form: Attempting to sign in with redirect to:', redirectTo || '/')

      // Save redirect info in localStorage before signing in
      localStorage.setItem('auth_redirect_after_login', redirectTo || '/')
      localStorage.setItem('auth_login_timestamp', Date.now().toString())
      
      // Sign in 
      await signIn(email, password, redirectTo || '/')

      // Force a page reload after successful login to ensure cookies are properly recognized
      // and redirects work properly regardless of client-side router state
      const destination = redirectTo || '/'
      console.log('Login Form: Authentication successful, redirecting to:', destination)
      
      // Set a flag in sessionStorage to indicate authentication in progress
      sessionStorage.setItem('auth_in_progress', 'true')
      sessionStorage.setItem('auth_redirect', destination)
      
      // Small delay to ensure cookies are set
      setTimeout(() => {
        // Use window.location for a full page reload to ensure proper authentication state
        console.log('Login Form: Redirecting now to', destination)
        // Force a full reload to ensure cookies are properly recognized
        window.location.href = destination
      }, 1000)
    } catch (err) {
      console.error('Login Form: Sign in error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in'
      setError(errorMessage)
    }
  }
  
  // Check for auth state when the component mounts
  useEffect(() => {
    const checkAuthState = async () => {
      const authInProgress = sessionStorage.getItem('auth_in_progress')
      const authRedirect = sessionStorage.getItem('auth_redirect') || localStorage.getItem('auth_redirect_after_login')
      const authLoginTimestamp = localStorage.getItem('auth_login_timestamp')
      
      // Only process redirects that are recent (within the last 30 seconds)
      const isRecent = authLoginTimestamp && 
        (Date.now() - parseInt(authLoginTimestamp, 10)) < 30000
      
      if (authInProgress === 'true' || (isRecent && authRedirect)) {
        console.log('Login Form: Auth in progress or recent login, checking session status...')
        
        // Clean up storage
        sessionStorage.removeItem('auth_in_progress')
        sessionStorage.removeItem('auth_redirect')
        
        // Check if we're logged in by accessing a secure endpoint
        try {
          const response = await fetch('/api/auth/debug', {
            credentials: 'include',
            cache: 'no-cache'
          })
          
          const data = await response.json()
          console.log('Login Form: Auth check response:', data)
          
          if (data.authenticated) {
            console.log('Login Form: User is authenticated, redirecting to', authRedirect)
            
            // Clear the redirect info
            localStorage.removeItem('auth_redirect_after_login')
            localStorage.removeItem('auth_login_timestamp')
            
            // Redirect to the intended destination
            window.location.href = authRedirect || '/'
          }
        } catch (error) {
          console.error('Login Form: Error checking auth status:', error)
        }
      }
    }
    
    checkAuthState()
  }, [])

  return (
    <div className="space-y-6">
      {registered && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            Registration successful! You can now sign in with your email and password.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </Button>
      </form>

      <div className="text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  )
}
