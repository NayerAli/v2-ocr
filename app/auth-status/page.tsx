'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { Session } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase-client'

export default function AuthStatusPage() {
  const { user, isLoading } = useAuth()
  const [clientSession, setClientSession] = useState<Session | null>(null)
  const [cookies, setCookies] = useState<string[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkClientAuth = async () => {
    setIsChecking(true)
    setError(null)

    try {
      // Get session from Supabase
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        throw error
      }

      setClientSession(data.session)

      // Parse cookies
      if (typeof document !== 'undefined') {
        const cookieList = document.cookie.split(';').map(c => c.trim())
        setCookies(cookieList)
      }
    } catch (err: unknown) {
      console.error('Error checking client auth:', err)
      setError('Failed to check client authentication')
    } finally {
      setIsChecking(false)
    }
  }

  const setTestCookie = () => {
    document.cookie = `test-cookie=value;path=/;max-age=${60 * 60};SameSite=Lax`
    checkClientAuth()
  }

  const clearCookies = () => {
    // Clear all cookies
    const cookieList = document.cookie.split(';')
    for (const cookie of cookieList) {
      const name = cookie.split('=')[0].trim()
      document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`
    }
    checkClientAuth()
  }

  const refreshSession = async () => {
    setIsChecking(true)
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        throw error
      }

      if (data.session) {
        // Manually set the cookie
        const cookieValue = JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        })

        document.cookie = `sb-auth-token=${encodeURIComponent(cookieValue)};path=/;max-age=${60 * 60 * 24 * 7};SameSite=Lax`

        // Also set the project-specific cookie
        const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
        if (projectId) {
          document.cookie = `sb-${projectId}-auth-token=${encodeURIComponent(cookieValue)};path=/;max-age=${60 * 60 * 24 * 7};SameSite=Lax`
        }

        setClientSession(data.session)
        checkClientAuth()
      }
    } catch (err: unknown) {
      console.error('Error refreshing session:', err)
      setError('Failed to refresh session')
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkClientAuth()
  }, [])

  return (
    <div className="container py-8 space-y-8">
      <h1 className="text-3xl font-bold">Authentication Status</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Auth Provider State</CardTitle>
            <CardDescription>Authentication state from the Auth Provider</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"></div>
                <p>Loading...</p>
              </div>
            ) : user ? (
              <div className="space-y-2">
                <p><strong>Authenticated:</strong> Yes</p>
                <p><strong>User ID:</strong> {user.id}</p>
                <p><strong>Email:</strong> {user.email}</p>
              </div>
            ) : (
              <p>Not authenticated</p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={() => window.location.reload()}>Refresh Page</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase Session</CardTitle>
            <CardDescription>Session from Supabase client</CardDescription>
          </CardHeader>
          <CardContent>
            {isChecking ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"></div>
                <p>Checking...</p>
              </div>
            ) : clientSession ? (
              <div className="space-y-2">
                <p><strong>Session Found:</strong> Yes</p>
                <p><strong>User ID:</strong> {clientSession.user.id}</p>
                <p><strong>Email:</strong> {clientSession.user.email}</p>
                <p><strong>Expires At:</strong> {clientSession.expires_at ? new Date(clientSession.expires_at * 1000).toLocaleString() : 'Unknown'}</p>
                <p><strong>Access Token:</strong> {clientSession.access_token ? 'Present' : 'Missing'}</p>
              </div>
            ) : (
              <p>No session found</p>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button onClick={checkClientAuth}>Check Session</Button>
            <Button onClick={refreshSession} variant="outline">Refresh Session</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Browser Cookies</CardTitle>
            <CardDescription>Cookies stored in the browser</CardDescription>
          </CardHeader>
          <CardContent>
            {cookies.length > 0 ? (
              <div className="space-y-2">
                <p><strong>Cookie Count:</strong> {cookies.length}</p>
                <div className="max-h-40 overflow-y-auto border rounded p-2">
                  <ul className="space-y-1">
                    {cookies.map((cookie, index) => (
                      <li key={index} className="text-sm font-mono">
                        {cookie}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p>No cookies found</p>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button onClick={setTestCookie} variant="outline">Set Test Cookie</Button>
            <Button onClick={clearCookies} variant="destructive">Clear Cookies</Button>
          </CardFooter>
        </Card>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-muted p-4 rounded-md">
        <h2 className="text-lg font-semibold mb-2">Debug Information</h2>
        <p className="text-sm mb-2">If you&apos;re having authentication issues, try these steps:</p>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Check if cookies are being set properly</li>
          <li>Verify that the session is valid and not expired</li>
          <li>Try refreshing the session using the button above</li>
          <li>Clear cookies and log in again if needed</li>
          <li>Check browser console for any errors</li>
        </ol>
      </div>
    </div>
  )
}
