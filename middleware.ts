import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { middlewareLog, prodError } from '@/lib/log'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const redirectWithCookies = (to: string, req: NextRequest, res: NextResponse) => {
  const r = NextResponse.redirect(new URL(to, req.url))
  res.cookies.getAll().forEach((c) => r.cookies.set(c))
  return r
}

// This function can be marked `async` if using `await` inside
export async function middleware(req: NextRequest) {
  // Always log the request URL in all environments
  middlewareLog('important', 'Middleware: Processing request for URL:', req.nextUrl.pathname)

  try {
    const res = NextResponse.next()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            res.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            res.cookies.set({ name, value: '', ...options })
          }
        }
      }
    )

    const { data } = await supabase.auth.getUser()
    const user = data.user as User | null

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
      if (process.env.NODE_ENV !== 'production') {
        middlewareLog('debug', 'Middleware: Redirecting to login from protected route:', url)
      }
      return redirectWithCookies(`/auth/login?redirect=${encodeURIComponent(url)}`, req, res)
    }

    // If accessing auth routes with authentication, redirect to home
    if (isAuthRoute && user) {
      if (process.env.NODE_ENV !== 'production') {
        middlewareLog('debug', 'Middleware: Redirecting to home from auth route:', url)
      }
      return redirectWithCookies('/', req, res)
    }

    // Add cache control headers to prevent caching of protected routes
    if (isProtectedRoute) {
      res.headers.set('Cache-Control', 'no-store, max-age=0')
    }

    return res
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
