import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

/**
 * Debug endpoint to check authentication status
 */
export async function GET(request: NextRequest) {
  try {
    // Create a Supabase client with cookies
    const supabase = createClient()
    
    // Get all cookies for debugging
    const cookieStore = cookies()
    const allCookies = cookieStore.getAll()
    const cookieNames = allCookies.map(c => c.name)
    
    // Get the session
    const { data, error } = await supabase.auth.getSession()
    
    if (error) {
      return NextResponse.json({
        authenticated: false,
        error: error.message,
        cookies: cookieNames,
        cookieCount: cookieNames.length
      })
    }
    
    // Return the auth status
    return NextResponse.json({
      authenticated: !!data.session,
      user: data.session?.user?.id,
      email: data.session?.user?.email,
      cookies: cookieNames,
      cookieCount: cookieNames.length,
      sessionExpires: data.session?.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : null
    })
  } catch (error) {
    console.error('Error in auth debug endpoint:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
