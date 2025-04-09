import { NextRequest, NextResponse } from 'next/server'
import { getUser, getSession } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getSupabaseClient } from '@/lib/supabase/singleton-client'

/**
 * GET /api/auth/status
 * Endpoint to check authentication status
 */
export async function GET(request: NextRequest) {
  try {
    // Get the current user and session
    const user = await getUser()
    const session = await getSession()
    
    // Get all cookies for debugging
    const cookieStore = cookies()
    const allCookies = cookieStore.getAll().map(c => ({ 
      name: c.name, 
      value: c.name.includes('token') ? '[REDACTED]' : c.value 
    }))
    
    // Get the Supabase client
    const supabase = getSupabaseClient()
    
    // Check if the session is valid
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    // Get the request headers for debugging
    const headers = Object.fromEntries(
      [...request.headers.entries()].map(([key, value]) => [
        key, 
        key.toLowerCase() === 'cookie' ? '[REDACTED]' : value
      ])
    )
    
    // Return the status information
    return NextResponse.json({
      authenticated: !!user,
      user: user ? {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      } : null,
      session: session ? {
        expires_at: session.expires_at,
        access_token: '[REDACTED]'
      } : null,
      cookies: {
        count: allCookies.length,
        names: allCookies.map(c => c.name)
      },
      supabaseSession: sessionData?.session ? {
        expires_at: sessionData.session.expires_at,
        user: {
          id: sessionData.session.user.id,
          email: sessionData.session.user.email
        }
      } : null,
      sessionError: sessionError ? sessionError.message : null,
      headers: {
        count: Object.keys(headers).length,
        has_cookie: headers['cookie'] !== undefined,
        has_authorization: headers['authorization'] !== undefined
      }
    })
  } catch (error) {
    console.error('Error in auth status endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to get auth status information' },
      { status: 500 }
    )
  }
}
