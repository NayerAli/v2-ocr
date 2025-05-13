import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/config'
import { debugLog, debugError, prodLog, middlewareLog } from '@/lib/log'

// This function can be marked `async` if using `await` inside
export async function middleware(req: NextRequest) {
  // Create a response object
  const res = NextResponse.next()

  // Always log the request URL in all environments
  console.log('Middleware: Processing request for URL:', req.nextUrl.pathname)

  // Create a temporary Supabase client for middleware using the centralized configuration
  const cookies = req.headers.get('cookie') || ''
  const supabase = createServerClient(cookies)

  // Only log in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Middleware: Created Supabase client with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  }

  // Get the session from cookies and Supabase
  let session = null

  try {
    // Log cookies for debugging (only cookie names, not values)
    const cookieHeader = req.headers.get('cookie') || 'No cookies'

    // Try to extract the auth token from cookies directly
    if (cookieHeader !== 'No cookies') {
      const cookies = cookieHeader.split(';').map(c => c.trim())
      const cookieNames = cookies.map(c => c.split('=')[0])
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Middleware: Parsed cookies:', cookieNames)
      }

      // Look for Supabase auth cookies
      const authCookieNames = cookies
        .filter(c =>
          c.startsWith('sb-auth-token=') ||
          c.startsWith('sb-localhost-auth-token=') ||
          c.startsWith('sb-localhost:8000-auth-token=') ||
          c.startsWith('sb-uvhjupgcggyuopxbirnp-auth-token=') ||
          c.includes('-auth-token=')
        )
        .map(c => c.split('=')[0])

      if (authCookieNames.length > 0) {
        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
          console.log('Middleware: Found auth cookies:', authCookieNames)
        }
      }
    }

    // Get the session from Supabase - our enhanced client will have already set the session if token was found
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      debugError('Middleware: Error getting session:', error.message)
    } else if (data?.session) {
      session = data.session
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Middleware: Session found for user:', data.session.user.email)
      }
    } else {
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Middleware: No session found from Supabase')
      }
      
      // Our enhanced client should handle setting the session, but keep fallback just in case
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user) {
        session = { user: userData.user } as any
        if (process.env.NODE_ENV !== 'production') {
          console.log('Middleware: User found from fallback:', userData.user.email)
        }
      }
    }
  } catch (e) {
    debugError('Middleware: Exception getting session:', e)
  }

  // Check auth condition based on route
  const url = req.nextUrl.pathname

  // Protected routes that require authentication
  const protectedRoutes = ['/profile', '/settings', '/documents', '/api/settings/user']

  // Auth routes that should redirect to home if already authenticated
  const authRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password']

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some(route => url.startsWith(route))

  // Check if the route is an auth route
  const isAuthRoute = authRoutes.some(route => url === route)

  // Always log route checks in all environments
  console.log('Middleware: Route check -', {
    url,
    isProtectedRoute,
    isAuthRoute,
    isAuthenticated: !!session
  })

  // If accessing a protected route without a session, redirect to login
  if (isProtectedRoute && !session) {
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Middleware: Redirecting to login from protected route:', url)
    }
    const redirectUrl = new URL('/auth/login', req.url)
    redirectUrl.searchParams.set('redirect', url)

    // Add cache control headers to prevent caching of the redirect
    const response = NextResponse.redirect(redirectUrl)
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  }

  // If accessing auth routes with a session, redirect to home
  if (isAuthRoute && session) {
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Middleware: Redirecting to home from auth route:', url)
    }
    const response = NextResponse.redirect(new URL('/', req.url))
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  }

  // Add cache control headers to prevent caching of protected routes
  if (isProtectedRoute) {
    res.headers.set('Cache-Control', 'no-store, max-age=0')
  }

  return res
}

// Specify which routes this middleware should run on
export const config = {
  matcher: [
    // Protected routes
    '/profile/:path*',
    '/settings/:path*',
    '/documents/:path*',
    '/api/settings/user',
    // Auth routes
    '/auth/:path*',
  ],
}
