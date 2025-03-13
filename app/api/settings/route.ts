import { NextRequest, NextResponse } from 'next/server';
import { getSettings, updateSettings, resetSettings } from '@/lib/server/settings';

// Simple in-memory cache for API responses
let responseCache: any = null;
let cacheTime = 0;
const CACHE_TTL = 10000; // 10 seconds

/**
 * GET /api/settings
 * Get current settings
 */
export async function GET() {
  try {
    // Check if we have a valid cache
    const now = Date.now();
    if (responseCache && (now - cacheTime < CACHE_TTL)) {
      return NextResponse.json(responseCache);
    }
    
    // Get fresh settings
    const settings = await getSettings();
    
    // Update cache
    responseCache = settings;
    cacheTime = now;
    
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings
 * Update settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Update settings
    const updatedSettings = await updateSettings(body);
    
    // Update cache
    responseCache = updatedSettings;
    cacheTime = Date.now();
    
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings
 * Reset settings to defaults
 */
export async function DELETE() {
  try {
    // Reset settings to defaults
    const defaultSettings = await resetSettings();
    
    // Update cache
    responseCache = defaultSettings;
    cacheTime = Date.now();
    
    return NextResponse.json(defaultSettings);
  } catch (error) {
    console.error('Error resetting settings:', error);
    return NextResponse.json(
      { error: 'Failed to reset settings' },
      { status: 500 }
    );
  }
} 