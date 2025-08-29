import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { verifyAccessToken } from '@/lib/jwt'
import { updateSession } from '@/lib/supabase/middleware'
import { middlewareLog, prodError } from '@/lib/log'

// This function can be marked `async` if using `await` inside
export async function middleware(req: NextRequest) {
  // Always log the request URL in all environments
  middlewareLog('important', 'Middleware: Processing request for URL:', req.nextUrl.pathname)

  try {
    // Use the updateSession function to create a Supabase client and handle session
    const { supabase, response: sessionResponse } = await updateSession(req)

    // Check if user is authenticated
    let user: User | null = null
    let error: unknown = null

    // Try to read the access token from cookies (supports project-specific names)
    const tokenCookieNames = ['sb-access-token', 'sb-localhost:8000-access-token']
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
    if (projectRef && !tokenCookieNames.includes(`sb-${projectRef}-access-token`)) {
      tokenCookieNames.push(`sb-${projectRef}-access-token`)
    }

    let accessToken: string | undefined
    for (const name of tokenCookieNames) {
      const val = req.cookies.get(name)?.value
      if (val) {
        accessToken = val
        break
      }
    }

    const claims = await verifyAccessToken(accessToken)
    if (claims) {
      user = {
        id: claims.id,
        email: claims.email,
        role: claims.role,
        aud: claims.aud,
      } as User
    } else {
      try {
        const { data, error: userError } = await supabase.auth.getUser()
        user = data?.user ?? null
        error = userError
      } catch (e) {
        prodError('Middleware: Error in auth.getUser():', e)
        if (!accessToken) {
          error = e
        }
      }
    }

    if (error) {
      prodError('Middleware: Error getting user:', error instanceof Error ? error.message : 'Unknown error')
    }

    // Prepare response with forwarded user headers
    const requestHeaders = new Headers(req.headers)
    if (user) {
      requestHeaders.set('x-user', encodeURIComponent(JSON.stringify(user)))
    }
    let response = NextResponse.next({ request: { headers: requestHeaders } })
    // copy cookies from sessionResponse to our response
    const sessionCookies = sessionResponse.cookies.getAll()
    for (const cookie of sessionCookies) {
      response.cookies.set({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        maxAge: cookie.maxAge,
        path: cookie.path,
        sameSite: cookie.sameSite as 'strict' | 'lax' | 'none' | undefined,
        secure: cookie.secure,
      })
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
      middlewareLog('important', 'Middleware: Route check -', {
        url,
        isProtectedRoute,
        isAuthRoute,
        isAuthenticated: !!user
      })

    // If accessing a protected route without authentication, redirect to login
    if (isProtectedRoute && !user) {
      // Only log in development
        if (process.env.NODE_ENV !== 'production') {
          middlewareLog('debug', 'Middleware: Redirecting to login from protected route:', url)
        }
      const redirectUrl = new URL('/auth/login', req.url)
      redirectUrl.searchParams.set('redirect', url)

      // Create a new response with redirect
      const redirectResponse = NextResponse.redirect(redirectUrl)
      
      // Copy cookies from the session response to the redirect response
      const cookiesList = sessionResponse.cookies.getAll()
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
          middlewareLog('debug', 'Middleware: Redirecting to home from auth route:', url)
        }
      const redirectResponse = NextResponse.redirect(new URL('/', req.url))
      
      // Copy cookies from the session response to the redirect response
      const homeRedirectCookies = sessionResponse.cookies.getAll()
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
      prodError('Middleware error:', error)
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
