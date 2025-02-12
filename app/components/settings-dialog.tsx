"use client"

import { useState, useEffect } from "react"
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { useSettings } from "@/store/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CONFIG } from "@/config/constants"
import { validateGoogleApiKey, validateMicrosoftApiKey } from "@/lib/api-validation"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { db } from "@/lib/indexed-db"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { DatabaseStats } from "@/types/settings"
import { useLanguage } from "@/hooks/use-language"
import { t, type Language } from "@/lib/i18n/translations"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toArabicNumerals(num: number | string, language: Language): string {
  if (language !== 'ar' && language !== 'fa') return String(num)
  
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)])
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [isValidating, setIsValidating] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const { toast } = useToast()
  const settings = useSettings()
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState("ocr")
  const { language } = useLanguage()

  useEffect(() => {
    if (open) {
      refreshStats()
    }
  }, [open])

  const handleValidateApiKey = async () => {
    setIsValidating(true)
    setValidationError(null)
    setIsValid(null)

    try {
      const result =
        settings.ocr.provider === "google"
          ? await validateGoogleApiKey(settings.ocr.apiKey)
          : await validateMicrosoftApiKey(settings.ocr.apiKey, settings.ocr.region || "")

      setIsValid(result.isValid)
      if (!result.isValid && result.error) {
        setValidationError(result.error)
        toast({
          variant: "destructive",
          title: t('apiValidationFailed', language),
          description: result.error,
        })
      } else {
        toast({
          title: t('apiValidationSuccess', language),
          description: t('apiConfigValid', language),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="space-y-2 px-0">
          <DialogTitle>⚙️ {t('settingsTitle', language)}</DialogTitle>
          <DialogDescription className="text-xs">
            {t('settingsDescription', language)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mr-6 pr-6 my-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 sticky top-0 bg-background z-10 mb-6">
              <TabsTrigger value="ocr" className="text-sm px-1">{t('ocrTab', language)}</TabsTrigger>
              <TabsTrigger value="processing" className="text-sm px-1">{t('processingTab', language)}</TabsTrigger>
              <TabsTrigger value="upload" className="text-sm px-1">{t('uploadTab', language)}</TabsTrigger>
              <TabsTrigger value="stats" className="text-sm px-1">{t('statsTab', language)}</TabsTrigger>
            </TabsList>

            <div className="px-1">
              <TabsContent value="ocr" className="space-y-4 mt-0 mb-6">
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
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="api-key" className="text-sm">🔑 {t('accessKey', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('accessKeyDescription', language)}</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="api-key"
                          type={showApiKey ? "text" : "password"}
                          value={settings.ocr.apiKey}
                          onChange={(e) => {
                            settings.updateOCRSettings({ apiKey: e.target.value })
                            setIsValid(null)
                            setValidationError(null)
                          }}
                          placeholder={t('enterApiKey', language)}
                          className="pr-10 font-mono text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowApiKey(!showApiKey)}
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
                          !settings.ocr.apiKey ||
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
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="max-concurrent-jobs" className="text-sm">📚 {t('parallelProcessing', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('parallelProcessingDescription', language)}</p>
                    <Input
                      id="max-concurrent-jobs"
                      type="number"
                      min={1}
                      max={10}
                      value={settings.processing.maxConcurrentJobs}
                      onChange={(e) => settings.updateProcessingSettings({ maxConcurrentJobs: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pages-per-chunk" className="text-sm">📄 {t('pagesPerBatch', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('pagesPerBatchDescription', language)}</p>
                    <Input
                      id="pages-per-chunk"
                      type="number"
                      min={1}
                      max={50}
                      value={settings.processing.pagesPerChunk}
                      onChange={(e) => settings.updateProcessingSettings({ pagesPerChunk: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="concurrent-chunks" className="text-sm">🚀 {t('processingSpeed', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('processingSpeedDescription', language)}</p>
                    <Input
                      id="concurrent-chunks"
                      type="number"
                      min={1}
                      max={5}
                      value={settings.processing.concurrentChunks}
                      onChange={(e) => settings.updateProcessingSettings({ concurrentChunks: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="retry-attempts" className="text-sm">🔄 {t('autoRetry', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('autoRetryDescription', language)}</p>
                    <Input
                      id="retry-attempts"
                      type="number"
                      min={0}
                      max={5}
                      value={settings.processing.retryAttempts}
                      onChange={(e) => settings.updateProcessingSettings({ retryAttempts: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="retry-delay" className="text-sm">⏲️ {t('retryTiming', language)}</Label>
                    <p className="text-xs text-muted-foreground">{t('retryTimingDescription', language)}</p>
                    <Input
                      id="retry-delay"
                      type="number"
                      min={100}
                      max={5000}
                      step={100}
                      value={settings.processing.retryDelay}
                      onChange={(e) => settings.updateProcessingSettings({ retryDelay: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
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
                                toArabicNumerals((stats.dbSize / stats.totalDocuments).toFixed(2), language) : '٠'} MB
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
            </div>
          </Tabs>
        </div>

        <div className="flex items-center justify-end border-t pt-6 px-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close', language)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

