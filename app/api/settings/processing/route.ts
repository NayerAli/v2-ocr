import { NextResponse } from 'next/server'
import { settingsService } from '@/lib/settings-service'

/**
 * GET /api/settings/processing
 * Retrieves the processing settings from the server
 */
export async function GET() {
  // Default settings to use as fallback
  const DEFAULT_SETTINGS = {
    maxConcurrentJobs: 2,
    pagesPerChunk: 2,
    concurrentChunks: 1,
    retryAttempts: 2,
    retryDelay: 1000
  };

  try {
    console.log('API Route: Processing settings requested')

    // Initialize the settings service if needed
    console.log('API Route: Initializing settings service')
    await settingsService.initialize()

    // Get the processing settings
    console.log('API Route: Fetching processing settings')
    const settings = await settingsService.getProcessingSettings()

    // If settings is null or undefined, use default settings
    const finalSettings = settings || DEFAULT_SETTINGS

    // Log the settings with a clear identifier
    console.log('=== API ROUTE: Retrieved processing settings from database ===', JSON.stringify(finalSettings, null, 2))

    // Add cache control headers to prevent excessive requests
    const headers = new Headers({
      'Cache-Control': 'public, max-age=60, s-maxage=60', // Cache for 1 minute
      'Content-Type': 'application/json'
    })

    // Return the settings
    return NextResponse.json({ settings: finalSettings }, { headers })
  } catch (error) {
    console.error('Error fetching processing settings:', error)

    // Return default settings if there's an error
    return NextResponse.json({
      settings: DEFAULT_SETTINGS,
      error: 'Using default settings due to an error'
    })
  }
}

/**
 * PUT /api/settings/processing
 * Updates the processing settings on the server
 * This endpoint should be protected in production
 */
export async function PUT(request: Request) {
  try {
    console.log('API Route: Processing settings update requested')
    const body = await request.json()
    console.log('API Route: Update request body:', body)

    // In a real application, you would check for admin permissions here
    // For now, we'll allow updates for demonstration purposes

    // Initialize the settings service if needed
    console.log('API Route: Initializing settings service before update')
    await settingsService.initialize()

    // Update the settings
    console.log('API Route: Updating processing settings')
    await settingsService.updateProcessingSettings(body)

    // Get the updated settings
    console.log('API Route: Fetching updated processing settings')
    const updatedSettings = await settingsService.getProcessingSettings()

    // Log the updated settings
    console.log('=== API ROUTE: Updated processing settings ===', JSON.stringify(updatedSettings, null, 2))

    return NextResponse.json({ settings: updatedSettings })
  } catch (error) {
    console.error('Error updating processing settings:', error)
    return NextResponse.json(
      { error: 'Failed to update processing settings' },
      { status: 500 }
    )
  }
}
