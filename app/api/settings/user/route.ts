import { NextResponse } from 'next/server'
import { userSettingsService } from '@/lib/user-settings-service'
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'
import { middlewareLog, prodError } from '@/lib/log'

/**
 * GET /api/settings/user
 * Retrieves the user-specific settings
 */
export async function GET(request: Request) {
  try {
    // Get the current user using server-side auth
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase, request)

    if (!user) {
      prodError('GET /api/settings/user - Auth session missing!')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    middlewareLog('important', 'GET /api/settings/user - User authenticated', {
      email: user.email
    })

    // Set the user ID in the userSettingsService
    userSettingsService.setUserId(user.id)

    // Try to create default settings if they don't exist
    middlewareLog('debug', '[API] Ensuring default settings exist for GET request')
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
    prodError('Error getting user settings:', error as Error)
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
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase, request)

    if (!user) {
      prodError('[API] PUT /api/settings/user - Unauthorized, no user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    userSettingsService.setUserId(user.id)
    middlewareLog('important', '[API] PUT /api/settings/user - Processing request for user', {
      id: user.id,
      email: user.email
    })

    // Get the request body
    const body = await request.json()
    const { ocr, processing, upload, display } = body

    middlewareLog('debug', '[API] Settings update request:', {
      hasOCR: !!ocr,
      hasProcessing: !!processing,
      hasUpload: !!upload,
      hasDisplay: !!display
    })

    // Update the settings and track success/failure
    const updateResults = {
      ocr: false,
      processing: false,
      upload: false,
      display: false
    };

    // Update OCR settings if provided
    if (ocr) {
      middlewareLog('debug', '[API] Updating OCR settings:', JSON.stringify(ocr))
      const updatedOCR = await userSettingsService.updateOCRSettings(ocr)
      updateResults.ocr = !!updatedOCR
      if (!updatedOCR) {
        prodError('[API] Failed to update OCR settings')
      } else {
        middlewareLog('debug', '[API] Successfully updated OCR settings:', JSON.stringify(updatedOCR))
      }
    }

    // Update processing settings if provided
    if (processing) {
      middlewareLog('debug', '[API] Updating processing settings')
      const updatedProcessing = await userSettingsService.updateProcessingSettings(processing)
      updateResults.processing = !!updatedProcessing
      if (!updatedProcessing) {
        prodError('[API] Failed to update processing settings')
      }
    }

    // Update upload settings if provided
    if (upload) {
      middlewareLog('debug', '[API] Updating upload settings')
      const updatedUpload = await userSettingsService.updateUploadSettings(upload)
      updateResults.upload = !!updatedUpload
      if (!updatedUpload) {
        prodError('[API] Failed to update upload settings')
      }
    }

    // Update display settings if provided
    if (display) {
      middlewareLog('debug', '[API] Updating display settings')
      const updatedDisplay = await userSettingsService.updateDisplaySettings(display)
      updateResults.display = !!updatedDisplay
      if (!updatedDisplay) {
        prodError('[API] Failed to update display settings')
      }
    }

    // Clear the cache to ensure we get fresh settings
    userSettingsService.clearCache();

    // Try to create default settings if they don't exist
    middlewareLog('debug', '[API] Ensuring default settings exist')
    await userSettingsService.createDefaultSettings()

    // Get the updated settings
    middlewareLog('debug', '[API] Retrieving updated settings')
    const updatedOCRSettings = await userSettingsService.getOCRSettings()
    const updatedProcessingSettings = await userSettingsService.getProcessingSettings()
    const updatedUploadSettings = await userSettingsService.getUploadSettings()
    const updatedDisplaySettings = await userSettingsService.getDisplaySettings()

    middlewareLog('important', '[API] Settings updated successfully')

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
    prodError('Error updating user settings:', error as Error)
    return NextResponse.json(
      { error: 'Failed to update user settings' },
      { status: 500 }
    )
  }
}
