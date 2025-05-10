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
  const [isAuthValid, setIsAuthValid] = useState<boolean | null>(null)
  const settings = useSettings()
  const { user, isLoading: isAuthLoading, hasInvalidToken } = useAuth()

  // Verify authentication state - uses auth status from AuthProvider when available
  const verifyAuth = async () => {
    // If AuthProvider already determined the token is invalid, trust that
    if (hasInvalidToken) {
      setIsAuthValid(false)
      return false
    }

    if (!user || isAuthLoading) {
      setIsAuthValid(false)
      return false
    }
    
    try {
      // Make a lightweight request to verify auth is valid
      const response = await fetch('/api/auth/status', {
        credentials: 'include',
        cache: 'no-cache'
      })
      
      const isValid = response.ok
      setIsAuthValid(isValid)
      
      if (!isValid && response.status === 401) {
        console.log('[DEBUG] Auth verification failed - invalid or expired session')
      }
      
      return isValid
    } catch (err) {
      console.error('[DEBUG] Auth verification error:', err)
      setIsAuthValid(false)
      return false
    }
  }

  const fetchUserSettings = async () => {
    // Don't attempt to fetch settings if AuthProvider has determined token is invalid
    if (hasInvalidToken) {
      console.log('[DEBUG] Skipping settings fetch - auth token known to be invalid')
      return
    }

    if (!user || isAuthLoading) return

    // Prevent multiple API calls
    if (isLoading) return

    setIsLoading(true)
    setError(null)
    setHasAttemptedFetch(true)

    try {
      console.log('[DEBUG] Fetching user settings from API')

      // Verify auth before proceeding with settings fetch
      if (isAuthValid === false) {
        console.log('[DEBUG] Skipping settings fetch - auth known to be invalid')
        return
      }
      
      if (isAuthValid === null) {
        const authVerified = await verifyAuth()
        if (!authVerified) {
          console.log('[DEBUG] Skipping settings fetch - auth verification failed')
          return
        }
      }

      // Add credentials to ensure cookies are sent
      const response = await fetch('/api/settings/user', {
        credentials: 'include', // Important: This ensures cookies are sent with the request
      })

      if (!response.ok) {
        if (response.status === 401) {
          // Auth is invalid - update state
          setIsAuthValid(false)
          console.log('[DEBUG] User not authenticated, skipping settings fetch')
          return
        }
        const errorText = await response.text()
        console.error('[DEBUG] Server returned error when fetching settings:', response.status, errorText)
        throw new Error(`Failed to fetch user settings: ${response.status} ${errorText}`)
      }

      // Auth is valid since fetch succeeded
      setIsAuthValid(true)
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
    // Don't attempt to update settings if AuthProvider has determined token is invalid
    if (hasInvalidToken) {
      console.log('[DEBUG] Skipping settings update - auth token known to be invalid')
      return
    }

    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping settings update');
      return;
    }

    // Verify auth is valid before proceeding
    if (isAuthValid === false) {
      console.log('[DEBUG] Skipping settings update - auth known to be invalid')
      return
    }
    
    if (isAuthValid === null) {
      const authVerified = await verifyAuth()
      if (!authVerified) {
        console.log('[DEBUG] Skipping settings update - auth verification failed')
        return
      }
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

        // If we get a 401 Unauthorized, mark auth as invalid
        if (response.status === 401) {
          setIsAuthValid(false)
          console.log('[DEBUG] Authentication error, session appears to be invalid');
          return;
        }

        throw new Error(`Failed to update user settings: ${response.status} ${errorText}`);
      }

      // Auth is valid since update succeeded
      setIsAuthValid(true)
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
    // Don't attempt to fetch if AuthProvider has determined token is invalid
    if (hasInvalidToken) {
      console.log('[DEBUG] Skipping initial settings fetch - auth token known to be invalid')
      return
    }
    
    // Only fetch if we have a user and haven't already attempted to fetch
    if (user && !isAuthLoading && !hasAttemptedFetch && !isLoading) {
      // First verify auth is valid
      verifyAuth().then(isValid => {
        if (isValid) {
          fetchUserSettings()
        }
      })
    }
  }, [user, isAuthLoading, hasAttemptedFetch, isLoading, hasInvalidToken])

  return {
    isLoading,
    error,
    fetchUserSettings,
    updateUserSettings,
    isAuthValid
  }
}
