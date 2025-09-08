import { NextResponse } from 'next/server'
import { systemSettingsService } from '@/lib/system-settings-service'
import { validateGoogleApiKey, validateMicrosoftApiKey, validateMistralApiKey } from '@/lib/api-validation'

export async function POST() {
  try {
    const defaults = await systemSettingsService.getOCRDefaults()
    let result
    if (defaults.provider === 'google') {
      result = await validateGoogleApiKey(defaults.apiKey)
    } else if (defaults.provider === 'microsoft') {
      result = await validateMicrosoftApiKey(defaults.apiKey, defaults.region || '')
    } else if (defaults.provider === 'mistral') {
      result = await validateMistralApiKey(defaults.apiKey)
    } else {
      result = { isValid: false, error: 'Unsupported provider' }
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ isValid: false, error: 'Validation failed' }, { status: 500 })
  }
}
