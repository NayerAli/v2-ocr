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
      console.log('[DEBUG] Fetching user settings from API')

      // Add credentials to ensure cookies are sent
      const response = await fetch('/api/settings/user', {
        credentials: 'include', // Important: This ensures cookies are sent with the request
      })

      if (!response.ok) {
        if (response.status === 401) {
          // Don't throw an error for unauthorized - this is expected when not logged in
          console.log('[DEBUG] User not authenticated, skipping settings fetch')
          return
        }
        const errorText = await response.text()
        console.error('[DEBUG] Server returned error when fetching settings:', response.status, errorText)
        throw new Error(`Failed to fetch user settings: ${response.status} ${errorText}`)
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

      // Add credentials to ensure cookies are sent
      const response = await fetch('/api/settings/user', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
        credentials: 'include', // Important: This ensures cookies are sent with the request
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DEBUG] Server returned error when updating settings:', response.status, errorText);

        // If we get a 401 Unauthorized, try to refresh the page to re-establish the session
        if (response.status === 401) {
          console.log('[DEBUG] Authentication error, will try to update settings again after a delay');

          // Wait a moment and try again
          setTimeout(() => {
            console.log('[DEBUG] Retrying settings update after authentication error');
            // Just update the local settings for now
            if (newSettings.ocr) settings.updateOCRSettings(newSettings.ocr);
            if (newSettings.processing) settings.updateProcessingSettings(newSettings.processing);
            if (newSettings.upload) settings.updateUploadSettings(newSettings.upload);
            if (newSettings.display) settings.updateDisplaySettings(newSettings.display);
          }, 1000);

          return;
        }

        throw new Error(`Failed to update user settings: ${response.status} ${errorText}`);
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
