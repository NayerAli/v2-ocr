import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'

/**
 * POST /api/auth/cleanup
 * Cleans up invalid auth cookies on the client
 */
export async function POST() {
  try {
    // Get all cookies
    const cookieStore = cookies()
    const authCookies = cookieStore.getAll().filter(cookie => 
      cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    )
    
    // Create response with cookies deletion
    const response = NextResponse.json({
      success: true,
      message: 'Auth cookies have been cleaned up',
      cookies_cleaned: authCookies.map(c => c.name)
    })
    
    // Clear all auth cookies by setting expiration in the past
    for (const cookie of authCookies) {
      // Set the cookie with same name but expired
      response.cookies.set({
        name: cookie.name,
        value: '',
        path: '/',
        expires: new Date(0), // Set to epoch time to ensure deletion
        maxAge: 0
      })
      
      console.log(`Clearing auth cookie: ${cookie.name}`)
    }
    
    return response
  } catch (error) {
    console.error('Error cleaning up auth cookies:', error)
    return NextResponse.json(
      { error: 'Failed to clean up auth cookies' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/cleanup
 * Returns info about existing auth cookies without modifying them
 */
export async function GET() {
  try {
    const cookieStore = cookies()
    const authCookies = cookieStore.getAll().filter(cookie => 
      cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    )
    
    const headersList = headers()
    const agent = headersList.get('user-agent') || 'unknown'
    
    return NextResponse.json({
      auth_cookies: authCookies.map(c => ({
        name: c.name,
        path: c.path,
        value: '[REDACTED]'
      })),
      browser: agent
    })
  } catch (error) {
    console.error('Error getting auth cookies info:', error)
    return NextResponse.json(
      { error: 'Failed to get auth cookies info' },
      { status: 500 }
    )
  }
} 