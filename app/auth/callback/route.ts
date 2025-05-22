import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { debugLog, debugError } from '@/lib/log'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = requestUrl.searchParams.get('redirect') || '/'

  debugLog('Auth callback: Processing callback with code and redirect to:', redirectTo)

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      debugError('Auth callback: Error exchanging code for session:', error)
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error.message)}`)
    }

    if (data?.session) {
      debugLog('Auth callback: Session created successfully for user:', data.session.user.email)
      debugLog('Auth callback: Session token:', data.session.access_token ? 'Present' : 'Missing')

      // Create the response with the redirect
      const response = NextResponse.redirect(`${requestUrl.origin}${redirectTo}`)

      // Add cache control headers to prevent caching of the redirect
      response.headers.set('Cache-Control', 'no-store, max-age=0')

      debugLog('Auth callback: Redirecting to:', redirectTo)
      return response
    } else {
      debugError('Auth callback: No session data returned')
    }
  } else {
    debugError('Auth callback: No code parameter found')
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${requestUrl.origin}${redirectTo}`)
}
