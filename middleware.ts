import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { debugLog, debugError, prodLog, middlewareLog } from '@/lib/log'

// This function can be marked `async` if using `await` inside
export async function middleware(req: NextRequest) {
  // Always log the request URL in all environments
  console.log('Middleware: Processing request for URL:', req.nextUrl.pathname)

  try {
    // Use the updateSession function to create a Supabase client and handle session
    const { supabase, response } = await updateSession(req)

    // Check if user is authenticated
    let user = null
    let error = null
    
    try {
      const { data, error: userError } = await supabase.auth.getUser()
      user = data?.user
      error = userError
    } catch (e) {
      console.error('Middleware: Error in auth.getUser():', e)
      error = e
    }
    
    if (error) {
      console.error('Middleware: Error getting user:', error instanceof Error ? error.message : 'Unknown error')
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
      isAuthenticated: !!user
    })

    // If accessing a protected route without authentication, redirect to login
    if (isProtectedRoute && !user) {
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Middleware: Redirecting to login from protected route:', url)
      }
      const redirectUrl = new URL('/auth/login', req.url)
      redirectUrl.searchParams.set('redirect', url)

      // Create a new response with redirect
      const redirectResponse = NextResponse.redirect(redirectUrl)
      
      // Copy cookies from the response to the redirect response
      const cookiesList = response.cookies.getAll()
      for (const cookie of cookiesList) {
        redirectResponse.cookies.set({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          maxAge: cookie.maxAge,
          path: cookie.path,
          sameSite: cookie.sameSite as "strict" | "lax" | "none" | undefined,
          secure: cookie.secure
        })
      }
      
      return redirectResponse
    }

    // If accessing auth routes with authentication, redirect to home
    if (isAuthRoute && user) {
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Middleware: Redirecting to home from auth route:', url)
      }
      const redirectResponse = NextResponse.redirect(new URL('/', req.url))
      
      // Copy cookies from the response to the redirect response
      const homeRedirectCookies = response.cookies.getAll()
      for (const cookie of homeRedirectCookies) {
        redirectResponse.cookies.set({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          maxAge: cookie.maxAge,
          path: cookie.path,
          sameSite: cookie.sameSite as "strict" | "lax" | "none" | undefined,
          secure: cookie.secure
        })
      }
      
      return redirectResponse
    }

    // Add cache control headers to prevent caching of protected routes
    if (isProtectedRoute) {
      response.headers.set('Cache-Control', 'no-store, max-age=0')
    }

    return response
  } catch (error) {
    console.error('Middleware error:', error)
    // Return original response to avoid breaking the application
    return NextResponse.next()
  }
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
