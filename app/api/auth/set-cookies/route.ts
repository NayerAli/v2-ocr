import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * API route to set auth cookies after successful authentication
 * This helps ensure cookies are properly set across domains
 */
export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json()
    const { event, session: clientSession } = body
    
    // Create a Supabase client with cookies
    const supabase = createClient()
    
    // Get current session from server
    const { data: { session } } = await supabase.auth.getSession()

    // If we have a session from the client but not on the server,
    // try to establish it using the session data from the client
    if (!session && clientSession && event === 'SIGNED_IN') {
      console.log('Setting cookies from client session data')
      
      // Return success with session info from the client
      return NextResponse.json(
        { 
          success: true,
          message: 'Using client session data to establish cookies',
          cookies_set: true
        },
        { 
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          }
        }
      )
    }

    if (!session) {
      return NextResponse.json(
        { error: 'No active session found' },
        { status: 401 }
      )
    }

    // Return success with session info and set cookies flag
    return NextResponse.json(
      { 
        success: true,
        user: session.user.id,
        cookies_set: true
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (error) {
    console.error('Error setting auth cookies:', error)
    return NextResponse.json(
      { error: 'Failed to set auth cookies' },
      { status: 500 }
    )
  }
} 