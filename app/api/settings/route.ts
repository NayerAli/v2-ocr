import { NextRequest, NextResponse } from 'next/server'
import { getSettings, updateSettings, resetSettings } from '@/lib/server/settings'
import type { SettingsState } from '@/types/settings'

/**
 * GET /api/settings
 * Get current settings
 */
export async function GET() {
  try {
    console.log('[API] Getting settings');
    const settings = await getSettings();
    console.log('[API] Settings retrieved:', {
      hasApiKey: !!settings.ocr.apiKey,
      provider: settings.ocr.provider,
      language: settings.ocr.language
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API] Error getting settings:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings
 * Update settings (alternative to PATCH for clients that don't support PATCH)
 */
export async function POST(request: NextRequest) {
  try {
    // Check if this is a reset request
    if (request.nextUrl.pathname === '/api/settings/reset') {
      console.log('[API] Resetting settings');
      const settings = await resetSettings();
      console.log('[API] Settings reset:', {
        hasApiKey: !!settings.ocr.apiKey,
        provider: settings.ocr.provider,
        language: settings.ocr.language
      });
      return NextResponse.json(settings);
    }

    // Handle normal settings update
    console.log('[API] Updating settings via POST');
    const partial: Partial<SettingsState> = await request.json();
    console.log('[API] Update payload:', {
      updatingOCR: !!partial.ocr,
      newApiKey: partial.ocr?.apiKey ? '***' : undefined,
      language: partial.ocr?.language
    });
    
    // Update settings
    const settings = await updateSettings(partial);
    
    console.log('[API] Settings updated:', {
      hasApiKey: !!settings.ocr.apiKey,
      provider: settings.ocr.provider,
      language: settings.ocr.language
    });
    
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API] Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * Update settings
 */
export async function PATCH(request: NextRequest) {
  try {
    console.log('[API] Updating settings via PATCH');
    const partial: Partial<SettingsState> = await request.json();
    console.log('[API] Update payload:', {
      updatingOCR: !!partial.ocr,
      newApiKey: partial.ocr?.apiKey ? '***' : undefined,
      language: partial.ocr?.language
    });
    
    // Update settings
    const settings = await updateSettings(partial);
    
    console.log('[API] Settings updated:', {
      hasApiKey: !!settings.ocr.apiKey,
      provider: settings.ocr.provider,
      language: settings.ocr.language
    });
    
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API] Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}