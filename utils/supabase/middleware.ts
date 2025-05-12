import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { debugLog, debugError } from '@/lib/log'

export async function updateSession(request: NextRequest) {
  // Create a new response that we'll modify and return
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // Set the cookie in the response with sensible defaults
            response.cookies.set({
              name,
              value,
              ...options,
              path: options.path || '/',
              sameSite: options.sameSite || 'lax',
              secure: process.env.NODE_ENV === 'production',
              httpOnly: true
            })
          } catch (error) {
            console.error(`Error setting cookie ${name}:`, error)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // Remove the cookie from the response
            response.cookies.delete({
              name,
              ...options,
              path: options.path || '/',
            })
          } catch (error) {
            console.error(`Error removing cookie ${name}:`, error)
          }
        },
      },
    }
  )

  // This will refresh the session if it exists
  // Always use getUser() instead of getSession() in server contexts for security
  const { data: { user } } = await supabase.auth.getUser()

  // Log detailed cookie debugging info in development
  if (process.env.NODE_ENV === 'development') {
    const cookieNames = request.cookies.getAll().map(c => c.name)
    debugLog('Middleware: Cookies present:', cookieNames.join(', ') || 'none')

    if (user) {
      debugLog('Middleware: User authenticated with ID:', user.id)
    } else {
      // Check for any auth-related cookies that might be malformed
      const hasAuthCookies = cookieNames.some(name =>
        name.includes('auth') || name.includes('supabase')
      )

      if (hasAuthCookies) {
        debugLog('Middleware: Auth cookies present but no user - possible cookie issue')
      } else {
        debugLog('Middleware: No authenticated user and no auth cookies')
      }
    }
  }

  // Check auth condition based on route
  const url = request.nextUrl.pathname

  // Protected routes that require authentication
  const protectedRoutes = ['/profile', '/settings', '/documents', '/api/settings/user']

  // Auth routes that should redirect to home if already authenticated
  const authRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password']

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some(route => url.startsWith(route))

  // Check if the route is an auth route
  const isAuthRoute = authRoutes.some(route => url === route)

  // If accessing a protected route without a session, redirect to login
  if (isProtectedRoute && !user) {
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      debugLog('Middleware: Redirecting to login from protected route:', url)
    }
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirect', url)

    // Add cache control headers to prevent caching of the redirect
    const redirectResponse = NextResponse.redirect(redirectUrl)
    redirectResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return redirectResponse
  }

  // If accessing auth routes with a session, redirect to home
  if (isAuthRoute && user) {
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      debugLog('Middleware: Redirecting to home from auth route:', url)
    }

    // Check if there's a specific redirect in the query params
    const params = request.nextUrl.searchParams
    const redirectTo = params.get('redirect') || '/'

    if (process.env.NODE_ENV !== 'production') {
      debugLog('Middleware: Redirecting authenticated user to:', redirectTo)
    }

    const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url))
    redirectResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return redirectResponse
  }

  // Add cache control headers to prevent caching of protected routes
  if (isProtectedRoute) {
    response.headers.set('Cache-Control', 'no-store, max-age=0')
  }

  return response
}
