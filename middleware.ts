import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This function can be marked `async` if using `await` inside
export async function middleware(req: NextRequest) {
  // Create a response object
  const res = NextResponse.next()

  // Create a temporary Supabase client for middleware
  // We don't use the singleton client here because middleware runs in a different context
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
      }
    }
  )

  // Get the session from the request cookie
  const supabaseAuthCookie = req.cookies.get('sb-auth-token')?.value
  let session = null

  if (supabaseAuthCookie) {
    try {
      // Parse the cookie value
      const authData = JSON.parse(supabaseAuthCookie)
      if (authData?.access_token) {
        // Set the session manually
        const { data, error } = await supabase.auth.getUser(authData.access_token)
        if (!error && data?.user) {
          session = { user: data.user, access_token: authData.access_token }
        }
      }
    } catch (e) {
      console.error('Error parsing auth cookie:', e)
    }
  }

  // Check auth condition based on route
  const url = req.nextUrl.pathname

  // Protected routes that require authentication
  const protectedRoutes = ['/profile', '/settings']

  // Auth routes that should redirect to home if already authenticated
  const authRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password']

  // If accessing a protected route without a session, redirect to login
  if (protectedRoutes.some(route => url.startsWith(route)) && !session) {
    const redirectUrl = new URL('/auth/login', req.url)
    redirectUrl.searchParams.set('redirect', url)
    return NextResponse.redirect(redirectUrl)
  }

  // If accessing auth routes with a session, redirect to home
  if (authRoutes.some(route => url === route) && session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

// Specify which routes this middleware should run on
export const config = {
  matcher: [
    // Protected routes
    '/profile/:path*',
    '/settings/:path*',
    // Auth routes
    '/auth/:path*',
  ],
}
