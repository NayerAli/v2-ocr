'use client'

import { useState, useEffect } from 'react'
import { useSettings } from '@/store/settings'
import { useAuth } from '@/components/auth/auth-provider'
import type { OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings } from '@/types/settings'

interface UserSettings {
  ocr: OCRSettings
  processing: ProcessingSettings
  upload: UploadSettings
  display: DisplaySettings
}

export function useUserSettings() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false)
  const settings = useSettings()
  const { user, isLoading: isAuthLoading } = useAuth()

  const fetchUserSettings = async () => {
    if (!user || isAuthLoading) return

    // Prevent multiple API calls
    if (isLoading) return

    setIsLoading(true)
    setError(null)
    setHasAttemptedFetch(true)

    try {
      const response = await fetch('/api/settings/user')

      if (!response.ok) {
        if (response.status === 401) {
          // Don't throw an error for unauthorized - this is expected when not logged in
          console.log('User not authenticated, skipping settings fetch')
          return
        }
        throw new Error(`Failed to fetch user settings: ${response.status}`)
      }

      const data = await response.json()

      // Update the settings store with user-specific settings
      if (data.settings.ocr) {
        settings.updateOCRSettings(data.settings.ocr)
      }
      if (data.settings.processing) {
        settings.updateProcessingSettings(data.settings.processing)
      }
      if (data.settings.upload) {
        settings.updateUploadSettings(data.settings.upload)
      }
      if (data.settings.display) {
        settings.updateDisplaySettings(data.settings.display)
      }
    } catch (err) {
      console.error('Error fetching user settings:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const updateUserSettings = async (newSettings: Partial<UserSettings>) => {
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping settings update');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[DEBUG] Updating user settings in database:', newSettings);

      const response = await fetch('/api/settings/user', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DEBUG] Server returned error when updating settings:', response.status, errorText);
        throw new Error('Failed to update user settings');
      }

      console.log('[DEBUG] Settings updated successfully in database');

      // Update local settings store
      if (newSettings.ocr) {
        console.log('[DEBUG] Updating local OCR settings:', newSettings.ocr);
        settings.updateOCRSettings(newSettings.ocr);
      }
      if (newSettings.processing) {
        console.log('[DEBUG] Updating local processing settings:', newSettings.processing);
        settings.updateProcessingSettings(newSettings.processing);
      }
      if (newSettings.upload) {
        console.log('[DEBUG] Updating local upload settings:', newSettings.upload);
        settings.updateUploadSettings(newSettings.upload);
      }
      if (newSettings.display) {
        console.log('[DEBUG] Updating local display settings:', newSettings.display);
        settings.updateDisplaySettings(newSettings.display);
      }
    } catch (err) {
      console.error('Error updating user settings:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  // Load user settings when the user changes
  useEffect(() => {
    // Only fetch if we have a user and haven't already attempted to fetch
    if (user && !isAuthLoading && !hasAttemptedFetch && !isLoading) {
      fetchUserSettings()
    }
  }, [user, isAuthLoading, hasAttemptedFetch, isLoading])

  return {
    isLoading,
    error,
    fetchUserSettings,
    updateUserSettings,
  }
}
