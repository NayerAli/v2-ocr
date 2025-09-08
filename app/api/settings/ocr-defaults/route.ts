import { NextResponse } from 'next/server'
import { systemSettingsService } from '@/lib/system-settings-service'

export async function GET() {
  try {
    const defaults = await systemSettingsService.getOCRDefaults()
    return NextResponse.json({
      provider: defaults.provider,
      region: defaults.region || '',
      language: defaults.language,
      hasApiKey: !!defaults.apiKey
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch OCR defaults' }, { status: 500 })
  }
}
