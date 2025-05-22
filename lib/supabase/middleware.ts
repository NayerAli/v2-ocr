import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

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

  // Refresh the session - this will set the necessary cookies
  try {
    await supabase.auth.getUser()
  } catch (error) {
    console.error('Error refreshing auth session:', error)
    // Implement retry for specific network errors
    if (error instanceof Error && 
        (error.name === 'AggregateError' || error.message?.includes('fetch failed'))) {
      console.warn('Retrying Supabase session refresh due to network error')
      await new Promise(resolve => setTimeout(resolve, 500))
      try {
        await supabase.auth.getUser()
      } catch (retryError) {
        console.error('Retry also failed:', retryError)
      }
    }
  }

  return { supabase, response }
} 