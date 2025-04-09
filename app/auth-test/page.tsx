'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getUser, getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase-client'

export default function AuthTestPage() {
  const { user, isLoading } = useAuth()
  const [serverUser, setServerUser] = useState<any>(null)
  const [serverSession, setServerSession] = useState<any>(null)
  const [clientSession, setClientSession] = useState<any>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkServerAuth = async () => {
    setIsChecking(true)
    setError(null)
    
    try {
      const response = await fetch('/api/auth/debug')
      const data = await response.json()
      
      setServerUser(data.user)
      setServerSession(data.session)
    } catch (err) {
      console.error('Error checking server auth:', err)
      setError('Failed to check server authentication')
    } finally {
      setIsChecking(false)
    }
  }

  const checkClientAuth = async () => {
    setIsChecking(true)
    setError(null)
    
    try {
      const { data, error } = await supabase.auth.getSession()
      
      if (error) {
        throw error
      }
      
      setClientSession(data.session)
    } catch (err) {
      console.error('Error checking client auth:', err)
      setError('Failed to check client authentication')
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkServerAuth()
    checkClientAuth()
  }, [])

  return (
    <div className="container py-8 space-y-8">
      <h1 className="text-3xl font-bold">Authentication Test</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client-Side Auth (Auth Provider)</CardTitle>
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
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Server-Side Auth</CardTitle>
            <CardDescription>Authentication state from the server</CardDescription>
          </CardHeader>
          <CardContent>
            {isChecking ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"></div>
                <p>Checking...</p>
              </div>
            ) : serverUser ? (
              <div className="space-y-2">
                <p><strong>Authenticated:</strong> Yes</p>
                <p><strong>User ID:</strong> {serverUser.id}</p>
                <p><strong>Email:</strong> {serverUser.email}</p>
                <p><strong>Session Expires:</strong> {serverSession?.expires_at ? new Date(serverSession.expires_at * 1000).toLocaleString() : 'Unknown'}</p>
              </div>
            ) : (
              <p>Not authenticated on server</p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={checkServerAuth}>Check Server Auth</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Client-Side Supabase Auth</CardTitle>
            <CardDescription>Authentication state directly from Supabase client</CardDescription>
          </CardHeader>
          <CardContent>
            {isChecking ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"></div>
                <p>Checking...</p>
              </div>
            ) : clientSession ? (
              <div className="space-y-2">
                <p><strong>Authenticated:</strong> Yes</p>
                <p><strong>User ID:</strong> {clientSession.user.id}</p>
                <p><strong>Email:</strong> {clientSession.user.email}</p>
                <p><strong>Session Expires:</strong> {clientSession.expires_at ? new Date(clientSession.expires_at * 1000).toLocaleString() : 'Unknown'}</p>
              </div>
            ) : (
              <p>No session found in Supabase client</p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={checkClientAuth}>Check Client Auth</Button>
          </CardFooter>
        </Card>
      </div>
      
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-md">
          {error}
        </div>
      )}
    </div>
  )
}
