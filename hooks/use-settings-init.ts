'use client'

import { useState, useEffect } from 'react'
import { useSettings } from '@/store/settings'
import { useUserSettings } from './use-user-settings'
import { debugLog } from '@/lib/log'
import { useAuth } from '@/components/auth/auth-provider'

interface UseSettingsInitResult {
  isInitialized: boolean
  isConfigured: boolean
}

export function useSettingsInit(): UseSettingsInitResult {
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasCheckedSettings, setHasCheckedSettings] = useState(false)
  const settings = useSettings()
  const { user, isLoading: authLoading } = useAuth()
  const { fetchUserSettings } = useUserSettings()

  // Check if settings are valid
  const isConfigured = Boolean(
    settings.ocr.apiKey &&
    (settings.ocr.provider !== "microsoft" || settings.ocr.region)
  )

  // Only log in development mode and not too frequently
  if (process.env.NODE_ENV === 'development' && Math.random() < 0.05) {
    debugLog('[DEBUG] useSettingsInit - OCR settings:', settings.ocr);
    debugLog('[DEBUG] useSettingsInit - isConfigured:', isConfigured);
  }

  // Function to check if required settings are properly initialized
  const checkSettingsInitialized = () => {
    debugLog('[DEBUG] useSettingsInit - Initial settings check')
    debugLog('[DEBUG] useSettingsInit - hasCheckedSettings:', hasCheckedSettings)
    
    // Determine if API key is available
    const hasApiKey = !!(settings.ocr.apiKey && settings.ocr.apiKey.length > 0)
    const isUsingSystemKey = settings.ocr.useSystemKey === true
    const hasValidApiKeyConfig = hasApiKey || isUsingSystemKey
    
    debugLog('[DEBUG] useSettingsInit - apiKey:', hasApiKey ? 'Present' : 'Missing')
    debugLog('[DEBUG] useSettingsInit - useSystemKey:', isUsingSystemKey)
    debugLog('[DEBUG] useSettingsInit - provider:', settings.ocr.provider)
    
    // Always consider settings valid if API key is available
    if (hasValidApiKeyConfig) {
      setIsInitialized(true)
      setHasCheckedSettings(true)
      debugLog('[DEBUG] useSettingsInit - Settings check complete: API key valid')
      return
    }
    
    // Fallback to checking other settings
    const requiredSettings = [
      settings.processing.maxConcurrentJobs > 0,
      settings.upload.maxFileSize > 0,
      settings.upload.allowedFileTypes.length > 0
    ]
    
    const initialized = requiredSettings.every(Boolean)
    setIsInitialized(initialized)
    setHasCheckedSettings(true)
    debugLog('[DEBUG] useSettingsInit - Settings check complete')
  }

  // Check if settings are initialized on mount
  useEffect(() => {
    // First check if settings are already initialized
    checkSettingsInitialized()
    
    // Then fetch user settings if user is authenticated
    if (user && !authLoading) {
      fetchUserSettings()
        .then(() => {
          // Re-check settings after fetching
          checkSettingsInitialized()
        })
        .catch(err => {
          console.error('Error fetching user settings:', err)
          // Still mark as initialized so the app is usable
          setIsInitialized(true)
        })
    }
  }, [user, authLoading])

  // Update initialization when settings change
  useEffect(() => {
    if (hasCheckedSettings) {
      // Only log in development mode and very infrequently
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) {
        debugLog('[DEBUG] useSettingsInit - Settings changed, rechecking')
        debugLog('[DEBUG] useSettingsInit - apiKey:', settings.ocr.apiKey ? 'Present' : 'Missing')
        debugLog('[DEBUG] useSettingsInit - provider:', settings.ocr.provider)
      }

      const hasValidSettings = Boolean(settings.ocr.apiKey &&
        (settings.ocr.provider !== "microsoft" || settings.ocr.region))

      setIsInitialized(hasValidSettings)
    }
  }, [settings.ocr.apiKey, settings.ocr.provider, settings.ocr.region, hasCheckedSettings])

  return {
    isInitialized,
    isConfigured
  }
}