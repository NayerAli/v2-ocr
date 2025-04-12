import { NextResponse } from 'next/server'
import { userSettingsService } from '@/lib/user-settings-service'
import { createServerSupabaseClient } from '@/lib/server-auth'

/**
 * GET /api/settings/user
 * Retrieves the user-specific settings
 */
export async function GET(request: Request) {
  try {
    // Get the current user using server-side auth
    const supabase = createServerSupabaseClient()

    // First try to get the session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('GET /api/settings/user - Session error:', sessionError.message)
    }

    let user = null;

    if (sessionData?.session?.user) {
      user = sessionData.session.user
    } else {
      // If no session, try to get the user directly
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userData?.user) {
        user = userData.user
      } else {
        // Try to extract user from cookies directly as a last resort
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
                    console.log('GET /api/settings/user - User authenticated from manual token:', manualSessionData.user.email)
                    user = manualSessionData.user
                  } else if (manualSessionError) {
                    console.error('GET /api/settings/user - Error setting manual session:', manualSessionError.message)
                  }
                }
              } catch (parseError) {
                console.error('GET /api/settings/user - Error parsing auth token:', parseError)
              }
            }
          }
        } catch (cookieError) {
          console.error('GET /api/settings/user - Error extracting user from cookies:', cookieError)
        }

        // If still no user, return unauthorized
        if (!user) {
          console.error('GET /api/settings/user - Auth session missing!',
                      sessionError?.message || userError?.message)
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        }
      }
    }

    console.log('User authenticated:', user.email)

    // Set the user ID in the userSettingsService
    userSettingsService.setUserId(user.id)

    // Try to create default settings if they don't exist
    console.log('[API] Ensuring default settings exist for GET request');
    await userSettingsService.createDefaultSettings();

    // Get the user settings
    const ocrSettings = await userSettingsService.getOCRSettings()
    const processingSettings = await userSettingsService.getProcessingSettings()
    const uploadSettings = await userSettingsService.getUploadSettings()
    const displaySettings = await userSettingsService.getDisplaySettings()

    // Add cache control headers to prevent excessive requests
    const headers = new Headers({
      'Cache-Control': 'private, max-age=60', // Cache for 1 minute, private to user
      'Content-Type': 'application/json'
    })

    // Return the settings
    return NextResponse.json({
      settings: {
        ocr: ocrSettings,
        processing: processingSettings,
        upload: uploadSettings,
        display: displaySettings
      }
    }, { headers })
  } catch (error) {
    console.error('Error getting user settings:', error)
    return NextResponse.json(
      { error: 'Failed to get user settings' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/user
 * Updates the user-specific settings
 */
export async function PUT(request: Request) {
  try {
    // Get the current user using server-side auth
    const supabase = createServerSupabaseClient()

    // First try to get the session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    let user = null;

    if (sessionData?.session?.user) {
      console.log('[API] User authenticated from session:', sessionData.session.user.email)
      user = sessionData.session.user
    } else {
      // If no session, try to get the user directly
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userData?.user) {
        console.log('[API] User authenticated from getUser:', userData.user.email)
        user = userData.user
      } else {
        // Try to extract user from cookies directly as a last resort
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
                    console.log('[API] User authenticated from manual token:', manualSessionData.user.email)
                    user = manualSessionData.user
                  } else if (manualSessionError) {
                    console.error('[API] Error setting manual session:', manualSessionError.message)
                  }
                }
              } catch (parseError) {
                console.error('[API] Error parsing auth token:', parseError)
              }
            }
          }
        } catch (cookieError) {
          console.error('[API] Error extracting user from cookies:', cookieError)
        }

        // If still no user, return unauthorized
        if (!user) {
          console.error('[API] PUT /api/settings/user - Unauthorized, no user found. Auth session missing!',
                      sessionError?.message || userError?.message);
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        }
      }
    }

    console.log('[API] User authenticated:', user.email)

    // Set the user ID in the userSettingsService
    userSettingsService.setUserId(user.id)

    console.log('[API] PUT /api/settings/user - Processing request for user:', user.id);

    // Get the request body
    const body = await request.json()
    const { ocr, processing, upload, display } = body

    console.log('[API] Settings update request:', {
      hasOCR: !!ocr,
      hasProcessing: !!processing,
      hasUpload: !!upload,
      hasDisplay: !!display
    });

    // Update the settings and track success/failure
    const updateResults = {
      ocr: false,
      processing: false,
      upload: false,
      display: false
    };

    // Update OCR settings if provided
    if (ocr) {
      console.log('[API] Updating OCR settings:', JSON.stringify(ocr));
      const updatedOCR = await userSettingsService.updateOCRSettings(ocr);
      updateResults.ocr = !!updatedOCR;
      if (!updatedOCR) {
        console.error('[API] Failed to update OCR settings');
      } else {
        console.log('[API] Successfully updated OCR settings:', JSON.stringify(updatedOCR));
      }
    }

    // Update processing settings if provided
    if (processing) {
      console.log('[API] Updating processing settings');
      const updatedProcessing = await userSettingsService.updateProcessingSettings(processing);
      updateResults.processing = !!updatedProcessing;
      if (!updatedProcessing) {
        console.error('[API] Failed to update processing settings');
      }
    }

    // Update upload settings if provided
    if (upload) {
      console.log('[API] Updating upload settings');
      const updatedUpload = await userSettingsService.updateUploadSettings(upload);
      updateResults.upload = !!updatedUpload;
      if (!updatedUpload) {
        console.error('[API] Failed to update upload settings');
      }
    }

    // Update display settings if provided
    if (display) {
      console.log('[API] Updating display settings');
      const updatedDisplay = await userSettingsService.updateDisplaySettings(display);
      updateResults.display = !!updatedDisplay;
      if (!updatedDisplay) {
        console.error('[API] Failed to update display settings');
      }
    }

    // Clear the cache to ensure we get fresh settings
    userSettingsService.clearCache();

    // Try to create default settings if they don't exist
    console.log('[API] Ensuring default settings exist');
    await userSettingsService.createDefaultSettings();

    // Get the updated settings
    console.log('[API] Retrieving updated settings');
    const updatedOCRSettings = await userSettingsService.getOCRSettings()
    const updatedProcessingSettings = await userSettingsService.getProcessingSettings()
    const updatedUploadSettings = await userSettingsService.getUploadSettings()
    const updatedDisplaySettings = await userSettingsService.getDisplaySettings()

    console.log('[API] Settings updated successfully');

    // Check if any updates failed
    const anyUpdatesFailed = Object.values(updateResults).some(result => result === false && result !== undefined);

    // Return the updated settings and update results
    return NextResponse.json({
      success: !anyUpdatesFailed,
      updateResults,
      settings: {
        ocr: updatedOCRSettings,
        processing: updatedProcessingSettings,
        upload: updatedUploadSettings,
        display: updatedDisplaySettings
      }
    })
  } catch (error) {
    console.error('Error updating user settings:', error)
    return NextResponse.json(
      { error: 'Failed to update user settings' },
      { status: 500 }
    )
  }
}
