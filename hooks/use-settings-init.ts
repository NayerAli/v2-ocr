import { useState, useEffect } from 'react'
import { useSettings } from '@/store/settings'

interface UseSettingsInitResult {
  isInitialized: boolean
  isConfigured: boolean
  shouldShowSettings: boolean
  setShouldShowSettings: (show: boolean) => void
}

export function useSettingsInit(): UseSettingsInitResult {
  const settings = useSettings()
  const [isInitialized, setIsInitialized] = useState(false)
  const [shouldShowSettings, setShouldShowSettings] = useState(false)
  const [hasCheckedSettings, setHasCheckedSettings] = useState(false)

  // Check if settings are valid
  const isConfigured = Boolean(
    settings.ocr.apiKey && 
    (settings.ocr.provider !== "microsoft" || settings.ocr.region)
  )

  // Handle initial settings check
  useEffect(() => {
    // Skip if we've already checked
    if (hasCheckedSettings) return

    // Check if settings are valid
    const hasValidSettings = settings.ocr.apiKey && 
      (settings.ocr.provider !== "microsoft" || settings.ocr.region)
    // Update initialization state
    setIsInitialized(Boolean(hasValidSettings))
    setHasCheckedSettings(true)

    // Only show settings dialog if no provider is set (first time use)
    // This prevents the dialog from showing on refresh when settings exist
    if (!settings.ocr.provider) {
      setShouldShowSettings(true)
    }
  }, [settings.ocr.apiKey, settings.ocr.provider, settings.ocr.region, hasCheckedSettings])

  // Update initialization when settings change
  useEffect(() => {
    if (hasCheckedSettings) {
      const hasValidSettings = Boolean(settings.ocr.apiKey && 
        (settings.ocr.provider !== "microsoft" || settings.ocr.region))
      setIsInitialized(hasValidSettings)
    }
  }, [settings.ocr.apiKey, settings.ocr.provider, settings.ocr.region, hasCheckedSettings])

  return {
    isInitialized,
    isConfigured,
    shouldShowSettings,
    setShouldShowSettings
  }
} 