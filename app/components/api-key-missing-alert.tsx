"use client"

import { AlertCircle, ArrowRight } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/hooks/use-language"
import { useSettings } from "@/store/settings"
import { useEffect, useState } from "react"

interface ConfigurationAlertProps {
  type: 'api-key-missing' | 'configuration-required';
}

/**
 * Unified alert component for configuration issues
 * This replaces both the API Key Missing alert and the Configuration Required alert
 * to ensure we don't have duplicate alerts
 */
export function ConfigurationAlert({ type: initialType }: ConfigurationAlertProps) {
  const router = useRouter()
  const { language, t } = useLanguage()
  const settings = useSettings()
  
  // Client-side type determination - will hide alert if client has API key
  const [actualType, setActualType] = useState<'api-key-missing' | 'configuration-required' | null>(initialType)
  
  useEffect(() => {
    // If the alert is for an API key missing, check if we actually have one client-side
    if (initialType === 'api-key-missing') {
      const hasApiKey = !!(settings.ocr.apiKey && settings.ocr.apiKey.length > 0)
      const isUsingSystemKey = settings.ocr.useSystemKey === true
      
      // If we have an API key or we're using system key, don't show the alert
      if (hasApiKey || isUsingSystemKey) {
        console.log('[DEBUG] Client has API key or useSystemKey, hiding alert')
        setActualType(null)
        return
      }
    }
    
    setActualType(initialType)
  }, [initialType, settings.ocr])
  
  // If client-side check determines we shouldn't show the alert, return null
  if (actualType === null) {
    return null
  }

  // Determine title and message based on alert type
  const title = actualType === 'api-key-missing'
    ? 'API Key Missing'
    : t('configureRequired', language)

  const message = actualType === 'api-key-missing'
    ? 'You need to set an API key for the OCR service to work. Files will be uploaded but not processed.'
    : t('configureMessage', language)

  const buttonText = actualType === 'api-key-missing'
    ? 'Configure Settings'
    : t('configureSettings', language)

  return (
    <Alert variant="destructive" className="mb-4">
      <div className="flex items-start">
        <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
        <div className="ml-2">
          <AlertTitle className="text-sm font-semibold">{title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 mt-1">
            <p className="text-sm">{message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/settings')}
              className="self-start text-xs font-medium px-3 py-1 h-7"
            >
              {buttonText}
              <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  )
}

// For backward compatibility
export function ApiKeyMissingAlert() {
  return <ConfigurationAlert type="api-key-missing" />
}