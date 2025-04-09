import { NextResponse } from 'next/server'
import { getUser, getSession } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getSupabaseClient } from '@/lib/supabase/singleton-client'

/**
 * GET /api/auth/debug
 * Debug endpoint to check authentication state
 */
export async function GET() {
  try {
    // Get the current user and session
    const user = await getUser()
    const session = await getSession()
    
    // Get all cookies for debugging
    const cookieStore = cookies()
    const allCookies = cookieStore.getAll().map(c => ({ 
      name: c.name, 
      value: c.name.includes('token') ? '[REDACTED]' : c.value 
    }))
    
    // Get the Supabase client
    const supabase = getSupabaseClient()
    
    // Check if the session is valid
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    // Return the debug information
    return NextResponse.json({
      authenticated: !!user,
      user: user ? {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      } : null,
      session: session ? {
        expires_at: session.expires_at,
        access_token: '[REDACTED]'
      } : null,
      cookies: allCookies,
      supabaseSession: sessionData?.session ? {
        expires_at: sessionData.session.expires_at,
        user: {
          id: sessionData.session.user.id,
          email: sessionData.session.user.email
        }
      } : null,
      sessionError: sessionError || null
    })
  } catch (error) {
    console.error('Error in auth debug endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to get auth debug information' },
      { status: 500 }
    )
  }
}
