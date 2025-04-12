import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This function can be marked `async` if using `await` inside
export async function middleware(req: NextRequest) {
  // Create a response object
  const res = NextResponse.next()

  // Log the request URL for debugging
  console.log('Middleware: Processing request for URL:', req.nextUrl.pathname)

  // Create a temporary Supabase client for middleware
  // We don't use the singleton client here because middleware runs in a different context
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          cookie: req.headers.get('cookie') || ''
        }
      }
    }
  )

  console.log('Middleware: Created Supabase client with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

  // Get the session from cookies and Supabase
  let session = null

  try {
    // Log cookies for debugging
    const cookieHeader = req.headers.get('cookie') || 'No cookies'
    console.log('Middleware: Cookies:', cookieHeader)

    // Try to extract the auth token from cookies directly
    if (cookieHeader !== 'No cookies') {
      const cookies = cookieHeader.split(';').map(c => c.trim())
      console.log('Middleware: Parsed cookies:', cookies.map(c => c.split('=')[0]))

      // Look for Supabase auth cookies
      const authCookies = cookies.filter(c =>
        c.startsWith('sb-auth-token=') ||
        c.startsWith('sb-localhost-auth-token=') ||
        c.startsWith('sb-localhost:8000-auth-token=') ||
        c.startsWith('sb-uvhjupgcggyuopxbirnp-auth-token=') ||
        c.includes('-auth-token=')
      )

      if (authCookies.length > 0) {
        console.log('Middleware: Found auth cookies:', authCookies.map(c => c.split('=')[0]))
      }
    }

    // Get the session from Supabase
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('Middleware: Error getting session:', error.message)
    } else if (data?.session) {
      session = data.session
      console.log('Middleware: Session found for user:', data.session.user.email)
    } else {
      console.log('Middleware: No session found from Supabase')

      // If no session from Supabase, try to parse cookies manually as a fallback
      if (cookieHeader !== 'No cookies') {
        const cookies = cookieHeader.split(';').map(c => c.trim())

        // Try each possible cookie name
        for (const cookieName of ['sb-auth-token', 'sb-localhost-auth-token']) {
          const authCookie = cookies.find(c => c.startsWith(`${cookieName}=`))
          if (authCookie) {
            try {
              const cookieValue = decodeURIComponent(authCookie.split('=')[1])
              const authData = JSON.parse(cookieValue)

              if (authData.access_token) {
                console.log('Middleware: Manually parsed auth token from cookie')

                // Verify the token
                const { data: userData, error: userError } = await supabase.auth.getUser(authData.access_token)

                if (!userError && userData?.user) {
                  session = { user: userData.user, ...authData }
                  console.log('Middleware: Manually verified user from token:', userData.user.email)
                  break
                }
              }
            } catch (e) {
              console.error(`Middleware: Error parsing ${cookieName} cookie:`, e)
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Middleware: Exception getting session:', e)
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

  console.log('Middleware: Route check -', {
    url,
    isProtectedRoute,
    isAuthRoute,
    isAuthenticated: !!session
  })

  // If accessing a protected route without a session, redirect to login
  if (isProtectedRoute && !session) {
    console.log('Middleware: Redirecting to login from protected route:', url)
    const redirectUrl = new URL('/auth/login', req.url)
    redirectUrl.searchParams.set('redirect', url)

    // Add cache control headers to prevent caching of the redirect
    const response = NextResponse.redirect(redirectUrl)
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  }

  // If accessing auth routes with a session, redirect to home
  if (isAuthRoute && session) {
    console.log('Middleware: Redirecting to home from auth route:', url)
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
