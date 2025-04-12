"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, AlertCircle, Eye, EyeOff, Lock, Server, CheckCircle } from "lucide-react"
import { useSettings } from "@/store/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CONFIG } from "@/config/constants"
import { validateGoogleApiKey, validateMicrosoftApiKey, validateMistralApiKey } from "@/lib/api-validation"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { db } from "@/lib/database"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { DatabaseStats, ProcessingSettings, OCRSettings, UploadSettings, DisplaySettings } from "@/types/settings"
import { useLanguage } from "@/hooks/use-language"
import { useServerSettings } from "@/hooks/use-server-settings"
import { t, type Language } from "@/lib/i18n/translations"
import { useUserSettings } from "@/hooks/use-user-settings"
import { useAuth } from "@/components/auth/auth-provider"
import { AuthCheck } from "@/components/auth/auth-check"
import { userSettingsService } from "@/lib/user-settings-service"

function toArabicNumerals(num: number | string, language: Language): string {
  if (language !== 'ar' && language !== 'fa') return String(num)

  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)])
}

export default function SettingsPage() {
  const [isValidating, setIsValidating] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const { toast } = useToast()
  const settings = useSettings()
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState("ocr")
  const { language } = useLanguage()
  const { processingSettings: serverProcessingSettings, isLoading: isLoadingSettings, refreshSettings, error: settingsError } = useServerSettings()
  const { user } = useAuth()
  const { isLoading: isLoadingUserSettings, fetchUserSettings, updateUserSettings } = useUserSettings()

  // Track if this is the initial settings render to prevent unnecessary API calls
  const isInitialSettingsRender = useRef(true)

  // Load user-specific settings when the page loads
  useEffect(() => {
    // Load data only once when the page loads
    refreshStats()
    refreshSettings()

    // Load user-specific settings if user is authenticated
    if (user) {
      fetchUserSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Track previous settings to avoid unnecessary updates
  const prevSettingsRef = useRef({
    ocr: { ...settings.ocr },
    processing: { ...settings.processing },
    upload: { ...settings.upload },
    display: { ...settings.display }
  });

  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  // Track if save is in progress
  const [isSaving, setIsSaving] = useState(false)

  // Save settings to database when they change
  useEffect(() => {
    // Don't save settings when the page is first loaded or when no user is logged in
    if (!user) return

    // Skip the first render to avoid unnecessary API calls
    if (isInitialSettingsRender.current) {
      isInitialSettingsRender.current = false
      prevSettingsRef.current = {
        ocr: { ...settings.ocr },
        processing: { ...settings.processing },
        upload: { ...settings.upload },
        display: { ...settings.display }
      }
      return
    }

    // Check if settings have actually changed
    const hasOCRChanged = JSON.stringify(settings.ocr) !== JSON.stringify(prevSettingsRef.current.ocr);
    const hasProcessingChanged = JSON.stringify(settings.processing) !== JSON.stringify(prevSettingsRef.current.processing);
    const hasUploadChanged = JSON.stringify(settings.upload) !== JSON.stringify(prevSettingsRef.current.upload);
    const hasDisplayChanged = JSON.stringify(settings.display) !== JSON.stringify(prevSettingsRef.current.display);

    // Only update if something has changed
    if (!hasOCRChanged && !hasProcessingChanged && !hasUploadChanged && !hasDisplayChanged) {
      setHasUnsavedChanges(false);
      return;
    }

    console.log('[DEBUG] Settings changed, marking as unsaved');
    setHasUnsavedChanges(true);

    // We're not auto-saving anymore, just marking changes as unsaved
    // The user will need to click the save button to save changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, settings.ocr, settings.processing, settings.upload, settings.display])

  // Force refresh settings when the component mounts
  useEffect(() => {
    // Small delay to ensure the component is fully rendered
    setTimeout(() => {
      refreshSettings()
    }, 500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Function to manually save settings
  const handleSaveSettings = async () => {
    if (!user) {
      toast({
        title: t('settings.toast.error', language),
        description: t('settings.toast.notLoggedIn', language),
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)

    try {
      console.log('[DEBUG] Manually saving settings to database')

      // Determine which settings have changed
      const hasOCRChanged = JSON.stringify(settings.ocr) !== JSON.stringify(prevSettingsRef.current.ocr)
      const hasProcessingChanged = JSON.stringify(settings.processing) !== JSON.stringify(prevSettingsRef.current.processing)
      const hasUploadChanged = JSON.stringify(settings.upload) !== JSON.stringify(prevSettingsRef.current.upload)
      const hasDisplayChanged = JSON.stringify(settings.display) !== JSON.stringify(prevSettingsRef.current.display)

      // Create an object with only the changed settings
      const updatedSettings: Partial<{
        ocr: typeof settings.ocr,
        processing: typeof settings.processing,
        upload: typeof settings.upload,
        display: typeof settings.display
      }> = {}

      // Only include settings that have changed
      if (hasOCRChanged) updatedSettings.ocr = settings.ocr
      if (hasProcessingChanged) updatedSettings.processing = settings.processing
      if (hasUploadChanged) updatedSettings.upload = settings.upload
      if (hasDisplayChanged) updatedSettings.display = settings.display

      // Save settings to database
      await updateUserSettings(updatedSettings)

      // Update previous settings after successful update
      prevSettingsRef.current = {
        ocr: { ...settings.ocr },
        processing: { ...settings.processing },
        upload: { ...settings.upload },
        display: { ...settings.display }
      }

      // Mark changes as saved
      setHasUnsavedChanges(false)

      // Show success toast
      toast({
        title: t('settings.toast.success', language),
        description: t('settings.toast.settingsSaved', language),
      })

      // Refresh settings from server to ensure we have the latest data
      await fetchUserSettings()
    } catch (error) {
      console.error('[DEBUG] Error saving settings:', error)

      // Show error toast
      toast({
        title: t('settings.toast.error', language),
        description: t('settings.toast.saveFailed', language),
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleValidateApiKey = async () => {
    setIsValidating(true)
    setValidationError(null)
    setIsValid(null)

    try {
      let result;
      // If using system key, use the default API key from environment
      const apiKeyToValidate = settings.ocr.useSystemKey !== false
        ? process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || ""
        : settings.ocr.apiKey;

      if (settings.ocr.provider === "google") {
        result = await validateGoogleApiKey(apiKeyToValidate);
      } else if (settings.ocr.provider === "microsoft") {
        result = await validateMicrosoftApiKey(apiKeyToValidate, settings.ocr.region || "");
      } else if (settings.ocr.provider === "mistral") {
        result = await validateMistralApiKey(apiKeyToValidate);
      }

      if (!result) {
        setValidationError("Validation failed with an unknown error")
        return
      }

      setIsValid(result.isValid)
      if (!result.isValid && result.error) {
        setValidationError(result.error)
        toast({
          variant: "destructive",
          title: t('apiValidationFailed', language),
          description: settings.ocr.useSystemKey !== false
            ? "System API key validation failed: " + result.error
            : result.error,
        })
      } else {
        toast({
          title: t('apiValidationSuccess', language),
          description: settings.ocr.useSystemKey !== false
            ? "System API key is valid and working correctly."
            : t('apiConfigValid', language),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('unexpectedError', language)
      setValidationError(message)
      toast({
        variant: "destructive",
        title: t('validationError', language),
        description: message,
      })
    } finally {
      setIsValidating(false)
    }
  }

  const refreshStats = async () => {
    const stats = await db.getDatabaseStats()
    setStats(stats)
  }

  return (
    <AuthCheck>
      <div className="container py-8 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">⚙️ {t('settingsTitle', language)}</h1>

          <Button
            onClick={handleSaveSettings}
            disabled={!hasUnsavedChanges || isSaving || isLoadingUserSettings}
            className={cn(
              "transition-all",
              hasUnsavedChanges ? "bg-green-600 hover:bg-green-700" : ""
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : hasUnsavedChanges ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Save Changes
              </>
            ) : (
              "No Changes"
            )}
          </Button>
        </div>

        <p className="text-muted-foreground mb-8">
          {t('settingsDescription', language)}
        </p>

        {hasUnsavedChanges && (
          <Alert className="mb-4 bg-yellow-50 border-yellow-200">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">Unsaved Changes</AlertTitle>
            <AlertDescription className="text-yellow-700">
              You have unsaved changes. Click the "Save Changes" button to save your settings to the database.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="ocr" className="text-sm px-1">{t('ocrTab', language)}</TabsTrigger>
              <TabsTrigger value="processing" className="text-sm px-1">{t('processingTab', language)}</TabsTrigger>
              <TabsTrigger value="upload" className="text-sm px-1">{t('uploadTab', language)}</TabsTrigger>
              <TabsTrigger value="stats" className="text-sm px-1">{t('statsTab', language)}</TabsTrigger>
            </TabsList>

            <TabsContent value="ocr" className="space-y-4 mt-0 mb-6">
              {!settings.ocr.apiKey && settings.ocr.useSystemKey === false && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>API Key Missing</AlertTitle>
                  <AlertDescription>
                    You need to set an API key for the OCR service to work. Files will be uploaded but not processed until you add a valid API key.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="provider" className="text-sm">🤖 {t('textRecognitionService', language)}</Label>
                  <p className="text-xs text-muted-foreground">{t('textRecognitionDescription', language)}</p>
                  <Select
                    value={settings.ocr.provider}
                    onValueChange={(value: (typeof CONFIG.SUPPORTED_APIS)[number]) => {
                      settings.updateOCRSettings({
                        provider: value,
                        apiKey: "",
                        region: "",
                      })
                      setIsValid(null)
                      setValidationError(null)
                    }}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google Cloud Vision</SelectItem>
                      <SelectItem value="microsoft">Microsoft Azure Vision</SelectItem>
                      <SelectItem value="mistral">Mistral OCR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-key" className="text-sm">🔑 {t('accessKey', language)}</Label>
                  <p className="text-xs text-muted-foreground">{t('accessKeyDescription', language)}</p>

                  <Alert className="mb-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>System API Key Available</AlertTitle>
                    <AlertDescription>
                      You can use our system API key or add your own. If you leave this field empty, the system API key will be used.
                    </AlertDescription>
                  </Alert>

                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id="use-system-key"
                      checked={settings.ocr.useSystemKey !== false}
                      onChange={(e) => {
                        settings.updateOCRSettings({
                          useSystemKey: e.target.checked,
                          // Clear API key if using system key
                          apiKey: e.target.checked ? '' : settings.ocr.apiKey
                        })
                        setIsValid(null)
                        setValidationError(null)
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="use-system-key" className="text-sm cursor-pointer">
                      Use system API key
                    </Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="api-key"
                        type={showApiKey ? "text" : "password"}
                        value={settings.ocr.apiKey}
                        onChange={(e) => {
                          settings.updateOCRSettings({
                            apiKey: e.target.value,
                            // If user enters an API key, disable system key
                            useSystemKey: e.target.value.length === 0
                          })
                          setIsValid(null)
                          setValidationError(null)
                        }}
                        placeholder={settings.ocr.useSystemKey !== false ? "Using system API key" : t('enterApiKey', language)}
                        className="pr-10 font-mono text-sm"
                        disabled={settings.ocr.useSystemKey !== false}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowApiKey(!showApiKey)}
                        disabled={settings.ocr.useSystemKey !== false}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        <span className="sr-only">
                          {showApiKey ? t('hideApiKey', language) : t('showApiKey', language)}
                        </span>
                      </Button>
                    </div>
                    <Button
                      onClick={handleValidateApiKey}
                      disabled={
                        isValidating ||
                        (!settings.ocr.apiKey && settings.ocr.useSystemKey === false) ||
                        (settings.ocr.provider === "microsoft" && !settings.ocr.region)
                      }
                      className="whitespace-nowrap"
                    >
                      {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isValid === true ? <span className="text-green-500 mr-2">✓</span> : null}
                      {t('testApi', language)}
                    </Button>
                  </div>
                  {settings.ocr.provider === "google" && (
                    <p className="text-sm text-muted-foreground">
                      Enter your Google Cloud Vision API key. Make sure the API is enabled in your Google Cloud Console.
                    </p>
                  )}
                  {settings.ocr.provider === "mistral" && (
                    <p className="text-sm text-muted-foreground">
                      Enter your Mistral API key. You can get it from the Mistral AI platform.
                    </p>
                  )}
                </div>

                {settings.ocr.provider === "microsoft" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="region" className="text-sm">🌍 {t('serviceLocation', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('serviceLocationDescription', language)}</p>
                    <Input
                      id="region"
                      value={settings.ocr.region}
                      onChange={(e) => {
                        settings.updateOCRSettings({ region: e.target.value })
                        setIsValid(null)
                        setValidationError(null)
                      }}
                      placeholder="e.g., westeurope, eastus2"
                      className="font-mono text-sm"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="language" className="text-sm">🗣️ {t('documentLanguage', language)}</Label>
                  <p className="text-xs text-muted-foreground">{t('documentLanguageDescription', language)}</p>
                  <Select
                    value={settings.ocr.language}
                    onValueChange={(value) => settings.updateOCRSettings({ language: value })}
                  >
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFIG.SUPPORTED_LANGUAGES.map((lang) => (
                        <SelectItem
                          key={lang.code}
                          value={lang.code}
                          className={cn(
                            "flex items-center justify-between gap-2",
                            lang.direction === "rtl" && "font-ibm-plex-sans-arabic"
                          )}
                        >
                          <span className={lang.direction === "rtl" ? "text-right" : "text-left"}>
                            {lang.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({lang.code.toUpperCase()})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {validationError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('validationError', language)}</AlertTitle>
                    <AlertDescription>{validationError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            <TabsContent value="processing" className="space-y-4 mt-0 mb-6">
              <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-md border border-muted">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  <span className="font-medium">{t('serverManagedSettings', language) || 'Server-Managed Settings'}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  <span>{t('readOnlySettings', language) || 'Read-only'}</span>
                </div>
              </div>

              {isLoadingSettings && !serverProcessingSettings ? (
                <div className="flex items-center justify-center p-4">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-sm text-muted-foreground">{t('loadingSettings', language) || 'Loading settings...'}</p>
                  </div>
                </div>
              ) : settingsError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('settingsError', language) || 'Error Loading Settings'}</AlertTitle>
                  <AlertDescription>
                    {settingsError}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => refreshSettings()}
                    >
                      {t('retry', language) || 'Retry'}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : !serverProcessingSettings ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('settingsError', language) || 'Settings Not Available'}</AlertTitle>
                  <AlertDescription>
                    Settings could not be loaded from the server.
                    <div className="flex flex-col gap-2 mt-2">
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refreshSettings()}
                        >
                          {t('retry', language) || 'Retry'}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        If this error persists, the settings table might not exist in the database.
                        Please check the server logs for more information.
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="max-concurrent-jobs" className="text-sm flex items-center gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      📚 {t('parallelProcessing', language)}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('parallelProcessingDescription', language)}</p>
                    <Input
                      id="max-concurrent-jobs"
                      type="number"
                      value={serverProcessingSettings?.maxConcurrentJobs || 2}
                      disabled
                      className="bg-muted cursor-not-allowed"
                      aria-readonly="true"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pages-per-chunk" className="text-sm flex items-center gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      📄 {t('pagesPerBatch', language)}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('pagesPerBatchDescription', language)}</p>
                    <Input
                      id="pages-per-chunk"
                      type="number"
                      value={serverProcessingSettings?.pagesPerChunk || 2}
                      disabled
                      className="bg-muted cursor-not-allowed"
                      aria-readonly="true"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="concurrent-chunks" className="text-sm flex items-center gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      🚀 {t('processingSpeed', language)}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('processingSpeedDescription', language)}</p>
                    <Input
                      id="concurrent-chunks"
                      type="number"
                      value={serverProcessingSettings?.concurrentChunks || 1}
                      disabled
                      className="bg-muted cursor-not-allowed"
                      aria-readonly="true"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="retry-attempts" className="text-sm flex items-center gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      🔄 {t('autoRetry', language)}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('autoRetryDescription', language)}</p>
                    <Input
                      id="retry-attempts"
                      type="number"
                      value={serverProcessingSettings?.retryAttempts || 2}
                      disabled
                      className="bg-muted cursor-not-allowed"
                      aria-readonly="true"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="retry-delay" className="text-sm flex items-center gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      ⏲️ {t('retryTiming', language)}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('retryTimingDescription', language)}</p>
                    <Input
                      id="retry-delay"
                      type="number"
                      value={serverProcessingSettings?.retryDelay || 1000}
                      disabled
                      className="bg-muted cursor-not-allowed"
                      aria-readonly="true"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload" className="space-y-4 mt-0 mb-6">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="max-file-size" className="text-sm">📦 {t('maxFileSize', language)}</Label>
                  <p className="text-xs text-muted-foreground">{t('maxFileSizeDescription', language)}</p>
                  <Input
                    id="max-file-size"
                    type="number"
                    min={1}
                    max={1000}
                    value={settings.upload.maxFileSize}
                    onChange={(e) => settings.updateUploadSettings({ maxFileSize: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('current', language)}: {settings.upload.maxFileSize}.0 MB
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="allowed-file-types" className="text-sm">📎 {t('acceptedFiles', language)}</Label>
                  <p className="text-xs text-muted-foreground">{t('acceptedFilesDescription', language)}</p>
                  <Input
                    id="allowed-file-types"
                    value={settings.upload.allowedFileTypes.join(", ")}
                    onChange={(e) => settings.updateUploadSettings({
                      allowedFileTypes: e.target.value.split(",").map(type => type.trim())
                    })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-simultaneous-uploads" className="text-sm">⬆️ {t('uploadSpeed', language)}</Label>
                  <p className="text-xs text-muted-foreground">{t('uploadSpeedDescription', language)}</p>
                  <Input
                    id="max-simultaneous-uploads"
                    type="number"
                    min={1}
                    max={10}
                    value={settings.upload.maxSimultaneousUploads}
                    onChange={(e) => settings.updateUploadSettings({ maxSimultaneousUploads: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4 mt-0 mb-6">
              <div className="space-y-4">
                <div className="flex justify-end mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshStats}
                    className="text-xs"
                  >
                    {t('refreshStats', language)}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm">📊 {t('storageOverview', language)}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>{t('totalDocuments', language)}:</span>
                          <span className="font-mono tabular-nums">{toArabicNumerals(stats?.totalDocuments || 0, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('totalResults', language)}:</span>
                          <span className="font-mono tabular-nums">{toArabicNumerals(stats?.totalResults || 0, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('storageUsed', language)}:</span>
                          <span className="font-mono tabular-nums">{toArabicNumerals(stats?.dbSize || 0, language)} MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('averageSizePerDoc', language)}:</span>
                          <span className="font-mono tabular-nums">
                            {stats?.totalDocuments ?
                              toArabicNumerals((stats.dbSize / stats.totalDocuments).toFixed(2), language) : '0'} MB
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm">🔍 {t('ocrSettings', language)}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>{t('provider', language)}:</span>
                          <span className="font-mono capitalize">{settings.ocr.provider}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('language', language)}:</span>
                          <span className="font-mono uppercase">{settings.ocr.language}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('pagesPerBatch', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.processing.pagesPerChunk, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('maxJobs', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.processing.maxConcurrentJobs, language)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm">⚡ {t('processingTab', language)}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>{t('concurrentChunks', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.processing.concurrentChunks, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('retryAttempts', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.processing.retryAttempts, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('retryDelay', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.processing.retryDelay, language)} ms</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm">📈 {t('uploadSettings', language)}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>{t('maxFileSize', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.upload.maxFileSize, language)} MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('maxParallel', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.upload.maxSimultaneousUploads, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('fileTypes', language)}:</span>
                          <span className="font-mono text-right text-xs">
                            {settings.upload.allowedFileTypes.join(", ")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('storageLimit', language)}:</span>
                          <span className="font-mono">{toArabicNumerals(settings.database.maxStorageSize, language)} MB</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {!stats && (
                  <div className="flex items-center justify-center p-4">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <p className="text-sm text-muted-foreground">{t('loadingStatistics', language)}</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AuthCheck>
  )
}
