import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServerUser } from '@/lib/server-auth'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/auth/status
 * Endpoint to check authentication status
 * Supports two modes:
 * - Detailed: Returns full debug information (when debug=true query param is present)
 * - Lightweight: Returns minimal auth status (default)
 */
export async function GET(request: NextRequest) {
  try {
    // Check if this is a detailed request
    const { searchParams } = new URL(request.url)
    const isDetailedRequest = searchParams.get('debug') === 'true'

    // Get the current user using server-side auth
    // Always use getUser() instead of getSession() for security
    const user = await getServerUser()

    // For minimal requests, return a simplified response
    if (!isDetailedRequest) {
      if (!user) {
        return NextResponse.json(
          { authenticated: false, error: 'No authenticated user found' },
          { status: 401 }
        )
      }

      return NextResponse.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email
        }
      })
    }

    // For detailed requests, get more information
    const supabase = await createClient()
    const { data: sessionData } = await supabase.auth.getSession()

    // Get all cookies for debugging
    const cookieStore = cookies()
    const allCookies = cookieStore.getAll().map(c => ({
      name: c.name,
      value: c.name.includes('token') ? '[REDACTED]' : c.value
    }))

    // Get the request headers for debugging
    const headerEntries: [string, string][] = [];
    request.headers.forEach((value, key) => {
      headerEntries.push([key, key.toLowerCase() === 'cookie' ? '[REDACTED]' : value]);
    });
    const headers = Object.fromEntries(headerEntries)

    // Return the detailed status information
    return NextResponse.json({
      authenticated: !!user,
      user: user ? {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      } : null,
      session: sessionData?.session ? {
        expires_at: sessionData.session.expires_at,
        access_token: '[REDACTED]'
      } : null,
      cookies: {
        count: allCookies.length,
        names: allCookies.map(c => c.name)
      },
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
