import { useState, useEffect } from 'react'
import { useSettings } from '@/store/settings'

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

  console.log('[DEBUG] useSettingsInit - OCR settings:', settings.ocr);
  console.log('[DEBUG] useSettingsInit - isConfigured:', isConfigured);

  // Handle initial settings check
  useEffect(() => {
    console.log('[DEBUG] useSettingsInit - Initial settings check');
    console.log('[DEBUG] useSettingsInit - hasCheckedSettings:', hasCheckedSettings);
    console.log('[DEBUG] useSettingsInit - apiKey:', settings.ocr.apiKey ? 'Present' : 'Missing');
    console.log('[DEBUG] useSettingsInit - provider:', settings.ocr.provider);

    // Skip if we've already checked
    if (hasCheckedSettings) return

    // Check if settings are valid
    const hasValidSettings = settings.ocr.apiKey &&
      (settings.ocr.provider !== "microsoft" || settings.ocr.region)
    console.log('[DEBUG] useSettingsInit - hasValidSettings:', hasValidSettings);

    // Update initialization state
    setIsInitialized(Boolean(hasValidSettings))
    setHasCheckedSettings(true)

    // No longer need to show settings dialog as we have a dedicated page
    console.log('[DEBUG] useSettingsInit - Settings check complete');
  }, [settings.ocr.apiKey, settings.ocr.provider, settings.ocr.region, hasCheckedSettings])

  // Update initialization when settings change
  useEffect(() => {
    if (hasCheckedSettings) {
      console.log('[DEBUG] useSettingsInit - Settings changed, rechecking');
      console.log('[DEBUG] useSettingsInit - apiKey:', settings.ocr.apiKey ? 'Present' : 'Missing');
      console.log('[DEBUG] useSettingsInit - provider:', settings.ocr.provider);

      const hasValidSettings = Boolean(settings.ocr.apiKey &&
        (settings.ocr.provider !== "microsoft" || settings.ocr.region))
      console.log('[DEBUG] useSettingsInit - hasValidSettings after change:', hasValidSettings);

      setIsInitialized(hasValidSettings)
    }
  }, [settings.ocr.apiKey, settings.ocr.provider, settings.ocr.region, hasCheckedSettings])

  return {
    isInitialized,
    isConfigured
  }
}