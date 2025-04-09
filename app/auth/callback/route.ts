import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase/singleton-client'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = requestUrl.searchParams.get('redirect') || '/'

  console.log('Auth callback: Processing callback with code and redirect to:', redirectTo)

  if (code) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth callback: Error exchanging code for session:', error)
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error.message)}`)
    }

    if (data?.session) {
      console.log('Auth callback: Session created successfully for user:', data.session.user.email)
      console.log('Auth callback: Session token:', data.session.access_token ? 'Present' : 'Missing')

      // Create the response with the redirect
      const response = NextResponse.redirect(`${requestUrl.origin}${redirectTo}`)

      // Manually set the auth cookie to ensure it's available for server-side requests
      // This is a critical step to ensure the middleware can detect the session
      const cookieValue = JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      })

      // Set the cookie with appropriate options
      response.cookies.set({
        name: 'sb-auth-token',
        value: cookieValue,
        path: '/',
        httpOnly: false, // Allow JavaScript access
        secure: process.env.NODE_ENV === 'production', // Secure in production
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      })

      // Also set the project-specific cookie name that Supabase might use
      const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
      if (projectId) {
        response.cookies.set({
          name: `sb-${projectId}-auth-token`,
          value: cookieValue,
          path: '/',
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7 // 1 week
        })
      }

      // Add cache control headers to prevent caching of the redirect
      response.headers.set('Cache-Control', 'no-store, max-age=0')

      console.log('Auth callback: Cookies set, redirecting to:', redirectTo)
      return response
    } else {
      console.error('Auth callback: No session data returned')
    }
  } else {
    console.error('Auth callback: No code parameter found')
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${requestUrl.origin}${redirectTo}`)
}
