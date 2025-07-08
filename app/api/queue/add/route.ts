import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/server-auth'
import { getSupabaseClient } from '@/lib/supabase/singleton-client'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'

/**
 * POST /api/queue/add
 * Add uploaded files to the processing queue
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Attempt to authenticate the user
    const { data: userData, error: userError } = await supabase.auth.getUser()
    let user = userData?.user || null

    if (!user && userError) {
      console.error('POST /api/queue/add - Error getting user:', userError.message)
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('POST /api/queue/add - Session error:', sessionError.message)
      }
      if (sessionData?.session?.user) {
        console.warn('POST /api/queue/add - Using session user as fallback (less secure)')
        user = sessionData.session.user
      }
    }

    // Fallback to extracting token from cookies
    let accessToken: string | null = null
    let refreshToken: string | null = null

    if (!user) {
      try {
        const cookieHeader = request.headers.get('cookie') || ''
        const cookies = cookieHeader.split(';').map(c => c.trim())
        const authCookie = cookies.find(c =>
          c.startsWith('sb-auth-token=') ||
          c.startsWith('sb-localhost:8000-auth-token=') ||
          c.includes('-auth-token=')
        )
        if (authCookie) {
          const tokenValue = authCookie.split('=')[1]
          if (tokenValue) {
            try {
              const tokenData = JSON.parse(decodeURIComponent(tokenValue))
              if (tokenData.access_token) {
                accessToken = tokenData.access_token
                refreshToken = tokenData.refresh_token || ''
                const { data: manualData, error: manualError } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken
                })
                if (manualData?.user) {
                  console.log('POST /api/queue/add - User authenticated from manual token:', manualData.user.email)
                  user = manualData.user
                } else if (manualError) {
                  console.error('POST /api/queue/add - Error setting manual session:', manualError.message)
                }
              }
            } catch (parseError) {
              console.error('POST /api/queue/add - Error parsing auth token:', parseError)
            }
          }
        }
      } catch (cookieError) {
        console.error('POST /api/queue/add - Error extracting user from cookies:', cookieError)
      }
    }

    // If still no user, return unauthorized
    if (!user) {
      console.error('POST /api/queue/add - Auth session missing!')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure the singleton client shares the same session for downstream utils
    if (accessToken) {
      try {
        const client = getSupabaseClient()
        await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || '' })
      } catch (e) {
        console.error('POST /api/queue/add - Error synchronizing session:', e)
      }
    }

    // Parse uploaded files
    const formData = await request.formData()
    const fileEntries = formData.getAll('files')
    const files: File[] = []
    for (const entry of fileEntries) {
      if (entry instanceof File) {
        files.push(entry)
      }
    }
    const single = formData.get('file')
    if (single instanceof File) {
      files.push(single)
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Add files to the processing queue
    const processingService = await getProcessingService(getDefaultSettings())
    const ids = await processingService.addToQueue(files)

    return NextResponse.json({ ids })
  } catch (error) {
    console.error('POST /api/queue/add - Error:', error)
    return NextResponse.json({ error: 'Failed to add files to queue' }, { status: 500 })
  }
}
