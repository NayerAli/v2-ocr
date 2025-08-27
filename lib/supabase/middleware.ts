import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { middlewareLog, prodError } from '@/lib/log'

/**
 * Middleware helper function that handles:
 * 1. Refreshing the session if needed
 * 2. Setting updated cookies in the response
 * 
 * @param request The Next.js request object
 * @returns The supabase client and response with updated cookies
 */
export async function updateSession(request: NextRequest) {
  // Create a response
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // If the cookie is updated, update the cookies for the request and response
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        }
      }
    }
  )

  // Determine if the session needs refreshing based on cookie expiry
  let shouldRefresh = true
  try {
    // Handle multiple possible auth cookie names (dev and prod)
    const cookieNames = ['sb-auth-token', 'sb-localhost:8000-auth-token']
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
    if (projectRef && !cookieNames.includes(`sb-${projectRef}-auth-token`)) {
      cookieNames.push(`sb-${projectRef}-auth-token`)
    }

    let authCookie: string | undefined
    for (const name of cookieNames) {
      const val = request.cookies.get(name)?.value
      if (val) {
        authCookie = val
        break
      }
    }

    if (authCookie) {
      const tokenData = JSON.parse(authCookie)
      const expiresAt = tokenData.expires_at
      if (expiresAt) {
        const now = Math.floor(Date.now() / 1000)
        if (expiresAt - now > 60) {
          shouldRefresh = false
          middlewareLog('debug', '[Supabase-Middleware] Session valid; skipping refresh')
        }
      }
    }
  } catch (e) {
    prodError('[Supabase-Middleware] Error parsing auth token for refresh check', e)
  }

  // Refresh the session only when necessary
  if (shouldRefresh) {
    try {
      await supabase.auth.getUser()
    } catch (error) {
      prodError('[Supabase-Middleware] Error refreshing auth session:', error)
      // Implement retry for specific network errors
      if (
        error instanceof Error &&
        (error.name === 'AggregateError' || error.message?.includes('fetch failed'))
      ) {
        middlewareLog('debug', '[Supabase-Middleware] Retrying session refresh after network error')
        await new Promise(resolve => setTimeout(resolve, 500))
        try {
          await supabase.auth.getUser()
        } catch (retryError) {
          prodError('[Supabase-Middleware] Retry also failed:', retryError)
        }
      }
    }
  }

  return { supabase, response }
} 