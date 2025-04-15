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
    // Initialize the settings service if needed
    await settingsService.initialize()

    // Get the processing settings
    const settings = await settingsService.getProcessingSettings()

    // If settings is null or undefined, use default settings
    const finalSettings = settings || DEFAULT_SETTINGS

    // Add cache control headers to prevent excessive requests
    const headers = new Headers({
      'Cache-Control': 'public, max-age=60, s-maxage=60', // Cache for 1 minute
      'Content-Type': 'application/json'
    })

    // Return the settings
    return NextResponse.json({ settings: finalSettings }, { headers })
  } catch {
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
    const body = await request.json()

    // In a real application, you would check for admin permissions here
    // For now, we'll allow updates for demonstration purposes

    // Initialize the settings service if needed
    await settingsService.initialize()

    // Update the settings
    await settingsService.updateProcessingSettings(body)

    // Get the updated settings
    const updatedSettings = await settingsService.getProcessingSettings()

    return NextResponse.json({ settings: updatedSettings })
  } catch {
    return NextResponse.json(
      { error: 'Failed to update processing settings' },
      { status: 500 }
    )
  }
}
