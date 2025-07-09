import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/server-auth'
import { db } from '@/lib/database'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'

/**
 * POST /api/queue/:id/cancel
 * Cancel processing for a document
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get the document ID from the URL
    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // Get the current user using server-side auth
    const supabase = await createServerSupabaseClient()

    // First try to get the user directly (more secure than using session user)
    const { data: userData, error: userError } = await supabase.auth.getUser()

    let user = null;

    if (userData?.user) {
      user = userData.user
    } else if (userError) {
      console.error('POST /api/queue/[id]/cancel - Error getting user:', userError.message)
      
      // Fallback to session if getUser fails
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('POST /api/queue/[id]/cancel - Session error:', sessionError.message)
      }

      if (sessionData?.session?.user) {
        console.warn('POST /api/queue/[id]/cancel - Using session user as fallback (less secure)')
        user = sessionData.session.user
      }
    }
    
    // If still no user, try to extract from cookies as last resort
    if (!user) {
      try {
        // Get the cookies from the request
        const cookieHeader = request.headers.get('cookie') || ''
        const cookies = cookieHeader.split(';').map(c => c.trim())

        // Find auth cookies
        const authCookie = cookies.find(c =>
          c.startsWith('sb-auth-token=') ||
          c.startsWith('sb-localhost:8000-auth-token=') ||
          c.includes('-auth-token=')
        )

        if (authCookie) {
          // Extract the token value
          const tokenValue = authCookie.split('=')[1]
          if (tokenValue) {
            // Parse the token
            try {
              const tokenData = JSON.parse(decodeURIComponent(tokenValue))
              if (tokenData.access_token) {
                // Set the session manually
                const { data: manualSessionData, error: manualSessionError } =
                  await supabase.auth.setSession({
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token || ''
                  })

                if (manualSessionData?.user) {
                  console.log('POST /api/queue/[id]/cancel - User authenticated from manual token:', manualSessionData.user.email)
                  user = manualSessionData.user
                } else if (manualSessionError) {
                  console.error('POST /api/queue/[id]/cancel - Error setting manual session:', manualSessionError.message)
                }
              }
            } catch (parseError) {
              console.error('POST /api/queue/[id]/cancel - Error parsing auth token:', parseError)
            }
          }
        }
      } catch (cookieError) {
        console.error('POST /api/queue/[id]/cancel - Error extracting user from cookies:', cookieError)
      }
    }
    
    // If still no user, return unauthorized
    if (!user) {
      console.error('POST /api/queue/[id]/cancel - Auth session missing!')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[API] Canceling processing for document ${id} for user:`, user.email)

    // Get the document from the queue
    const queue = await db.getQueue()
    const document = queue.find(doc => doc.id === id)

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check if the document belongs to the current user
    if (document.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Get processing service with default settings
    const processingService = await getProcessingService(getDefaultSettings())

    // Cancel processing
    await processingService.cancelProcessing(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error canceling processing:', error)
    return NextResponse.json(
      { error: 'Failed to cancel processing' },
      { status: 500 }
    )
  }
}
