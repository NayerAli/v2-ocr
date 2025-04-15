import { useState, useEffect } from 'react'
import { useSettings } from '@/store/settings'
import { debugLog } from '@/lib/log'

interface UseSettingsInitResult {
  isInitialized: boolean
  isConfigured: boolean
}

export function useSettingsInit(): UseSettingsInitResult {
  const settings = useSettings()
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasCheckedSettings, setHasCheckedSettings] = useState(false)

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

  // Handle initial settings check
  useEffect(() => {
    // Only log in development mode and not on every render
    if (process.env.NODE_ENV === 'development' && !hasCheckedSettings) {
      debugLog('[DEBUG] useSettingsInit - Initial settings check');
      debugLog('[DEBUG] useSettingsInit - hasCheckedSettings:', hasCheckedSettings);
      debugLog('[DEBUG] useSettingsInit - apiKey:', settings.ocr.apiKey ? 'Present' : 'Missing');
      debugLog('[DEBUG] useSettingsInit - provider:', settings.ocr.provider);
    }

    // Skip if we've already checked
    if (hasCheckedSettings) return

    // Check if settings are valid
    const hasValidSettings = settings.ocr.apiKey &&
      (settings.ocr.provider !== "microsoft" || settings.ocr.region)

    // Update initialization state
    setIsInitialized(Boolean(hasValidSettings))
    setHasCheckedSettings(true)

    // No longer need to show settings dialog as we have a dedicated page
    if (process.env.NODE_ENV === 'development' && !hasCheckedSettings) {
      debugLog('[DEBUG] useSettingsInit - Settings check complete');
    }
  }, [settings.ocr.apiKey, settings.ocr.provider, settings.ocr.region, hasCheckedSettings])

  // Update initialization when settings change
  useEffect(() => {
    if (hasCheckedSettings) {
      // Only log in development mode and very infrequently
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) {
        debugLog('[DEBUG] useSettingsInit - Settings changed, rechecking');
        debugLog('[DEBUG] useSettingsInit - apiKey:', settings.ocr.apiKey ? 'Present' : 'Missing');
        debugLog('[DEBUG] useSettingsInit - provider:', settings.ocr.provider);
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