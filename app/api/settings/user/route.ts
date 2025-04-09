import { NextResponse } from 'next/server'
import { userSettingsService } from '@/lib/user-settings-service'
import { getUser } from '@/lib/auth'

/**
 * GET /api/settings/user
 * Retrieves the user-specific settings
 */
export async function GET() {
  try {
    // Get the current user
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

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
    // Get the current user
    const user = await getUser()
    if (!user) {
      console.log('[API] PUT /api/settings/user - Unauthorized, no user found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

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

    // Update the settings
    if (ocr) {
      console.log('[API] Updating OCR settings');
      await userSettingsService.updateOCRSettings(ocr)
    }
    if (processing) {
      console.log('[API] Updating processing settings');
      await userSettingsService.updateProcessingSettings(processing)
    }
    if (upload) {
      console.log('[API] Updating upload settings');
      await userSettingsService.updateUploadSettings(upload)
    }
    if (display) {
      console.log('[API] Updating display settings');
      await userSettingsService.updateDisplaySettings(display)
    }

    // Clear the cache to ensure we get fresh settings
    userSettingsService.clearCache();

    // Get the updated settings
    console.log('[API] Retrieving updated settings');
    const updatedOCRSettings = await userSettingsService.getOCRSettings()
    const updatedProcessingSettings = await userSettingsService.getProcessingSettings()
    const updatedUploadSettings = await userSettingsService.getUploadSettings()
    const updatedDisplaySettings = await userSettingsService.getDisplaySettings()

    console.log('[API] Settings updated successfully');

    // Return the updated settings
    return NextResponse.json({
      success: true,
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
