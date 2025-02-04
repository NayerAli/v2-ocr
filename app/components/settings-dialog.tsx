"use client"

import { useState, useEffect } from "react"
import { Loader2, AlertCircle, Eye, EyeOff, Trash2, Database, RefreshCw } from "lucide-react"
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
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { db } from "@/lib/indexed-db"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { DatabaseStats } from "@/types/settings"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const settings = useSettings()
  const { toast } = useToast()
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [activeTab, setActiveTab] = useState("ocr")
  const [dbStats, setDbStats] = useState<DatabaseStats>({ totalDocuments: 0, totalResults: 0, dbSize: 0 })
  const [isClearing, setIsClearing] = useState(false)

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
          title: "API Validation Failed",
          description: result.error,
        })
      } else {
        toast({
          title: "API Validation Successful",
          description: "Your API configuration is valid.",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred"
      setValidationError(message)
      toast({
        variant: "destructive",
        title: "API Validation Error",
        description: message,
      })
    } finally {
      setIsValidating(false)
    }
  }

  const refreshStats = async () => {
    const stats = await db.getDatabaseStats()
    setDbStats(stats)
  }

  const handleClearDatabase = async (type?: 'queue' | 'results' | 'all') => {
    if (window.confirm(`Are you sure you want to clear ${type || 'all'} data? This action cannot be undone.`)) {
      try {
        setIsClearing(true)
        await db.clearDatabase(type)
        await refreshStats()
        toast({
          title: "Database Cleared",
          description: `${type || 'All'} data has been cleared successfully.`,
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to clear database. Please try again.",
        })
      } finally {
        setIsClearing(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px]">
        <DialogHeader className="space-y-3">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure the OCR processing system settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ocr">OCR</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
          </TabsList>

          <TabsContent value="ocr" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="provider">API Provider</Label>
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

              <div className="space-y-2">
                <Label htmlFor="api-key">{settings.ocr.provider === "google" ? "Google API Key" : "Azure API Key"}</Label>
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
                      placeholder={`Enter your ${settings.ocr.provider === "google" ? "Google" : "Azure"} API key`}
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
                      <span className="sr-only">{showApiKey ? "Hide API key" : "Show API key"}</span>
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
                    Test API
                  </Button>
                </div>
                {settings.ocr.provider === "google" && (
                  <p className="text-sm text-muted-foreground">
                    Enter your Google Cloud Vision API key. Make sure the API is enabled in your Google Cloud Console.
                  </p>
                )}
              </div>

              {settings.ocr.provider === "microsoft" && (
                <div className="space-y-2">
                  <Label htmlFor="region">Azure Region</Label>
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
                  <p className="text-sm text-muted-foreground">
                    Enter the region where your Azure Computer Vision resource is deployed.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="language">Primary Language</Label>
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
                  <AlertTitle>Validation Error</AlertTitle>
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          <TabsContent value="processing" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="max-concurrent-jobs">Maximum Concurrent Jobs</Label>
                  <span className="text-sm text-muted-foreground">{settings.processing.maxConcurrentJobs}</span>
                </div>
                <Input
                  id="max-concurrent-jobs"
                  type="number"
                  min={1}
                  max={10}
                  value={settings.processing.maxConcurrentJobs}
                  onChange={(e) => settings.updateProcessingSettings({ maxConcurrentJobs: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="pages-per-chunk">Pages per Chunk</Label>
                  <span className="text-sm text-muted-foreground">{settings.processing.pagesPerChunk}</span>
                </div>
                <Input
                  id="pages-per-chunk"
                  type="number"
                  min={1}
                  max={50}
                  value={settings.processing.pagesPerChunk}
                  onChange={(e) => settings.updateProcessingSettings({ pagesPerChunk: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="concurrent-chunks">Concurrent Chunks</Label>
                  <span className="text-sm text-muted-foreground">{settings.processing.concurrentChunks}</span>
                </div>
                <Input
                  id="concurrent-chunks"
                  type="number"
                  min={1}
                  max={5}
                  value={settings.processing.concurrentChunks}
                  onChange={(e) => settings.updateProcessingSettings({ concurrentChunks: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="retry-attempts">Retry Attempts</Label>
                  <span className="text-sm text-muted-foreground">{settings.processing.retryAttempts}</span>
                </div>
                <Input
                  id="retry-attempts"
                  type="number"
                  min={0}
                  max={5}
                  value={settings.processing.retryAttempts}
                  onChange={(e) => settings.updateProcessingSettings({ retryAttempts: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="retry-delay">Retry Delay (ms)</Label>
                  <span className="text-sm text-muted-foreground">{settings.processing.retryDelay}ms</span>
                </div>
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

          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="max-file-size">Maximum File Size (MB)</Label>
                  <span className="text-sm text-muted-foreground">{settings.upload.maxFileSize} MB</span>
                </div>
                <Input
                  id="max-file-size"
                  type="number"
                  min={1}
                  max={1000}
                  value={settings.upload.maxFileSize}
                  onChange={(e) => settings.updateUploadSettings({ maxFileSize: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">Current: {settings.upload.maxFileSize}.0 MB</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="allowed-file-types">Allowed File Types</Label>
                <Input
                  id="allowed-file-types"
                  value={settings.upload.allowedFileTypes.join(", ")}
                  onChange={(e) => settings.updateUploadSettings({ 
                    allowedFileTypes: e.target.value.split(",").map(type => type.trim()) 
                  })}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of file extensions</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="max-simultaneous-uploads">Maximum Simultaneous Uploads</Label>
                  <span className="text-sm text-muted-foreground">{settings.upload.maxSimultaneousUploads}</span>
                </div>
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

          <TabsContent value="display" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select
                  value={settings.display.theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') => 
                    settings.updateDisplaySettings({ theme: value })}
                >
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="font-size">Font Size</Label>
                  <span className="text-sm text-muted-foreground">{settings.display.fontSize}px</span>
                </div>
                <Slider
                  id="font-size"
                  min={12}
                  max={24}
                  step={1}
                  value={[settings.display.fontSize]}
                  onValueChange={([value]) => settings.updateDisplaySettings({ fontSize: value })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="show-confidence"
                  checked={settings.display.showConfidenceScores}
                  onChange={(e) => settings.updateDisplaySettings({ showConfidenceScores: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="show-confidence">Show Confidence Scores</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="highlight-uncertain"
                  checked={settings.display.highlightUncertain}
                  onChange={(e) => settings.updateDisplaySettings({ highlightUncertain: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="highlight-uncertain">Highlight Uncertain Text</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="database" className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Database Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Documents:</span>
                      <span className="font-mono">{dbStats.totalDocuments}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Results:</span>
                      <span className="font-mono">{dbStats.totalResults}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Storage Used:</span>
                      <span className="font-mono">{dbStats.dbSize} MB</span>
                    </div>
                    {dbStats.lastCleared && (
                      <div className="flex justify-between">
                        <span>Last Cleared:</span>
                        <span className="font-mono">
                          {new Date(dbStats.lastCleared).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Auto Cleanup</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="auto-cleanup"
                        checked={settings.database.autoCleanup}
                        onChange={(e) => settings.updateDatabaseSettings({ autoCleanup: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="auto-cleanup">Enable Auto Cleanup</Label>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="retention-period">Retention Period (days)</Label>
                      <Input
                        id="retention-period"
                        type="number"
                        min={1}
                        max={365}
                        value={settings.database.retentionPeriod}
                        onChange={(e) => settings.updateDatabaseSettings({ 
                          retentionPeriod: parseInt(e.target.value) 
                        })}
                        disabled={!settings.database.autoCleanup}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Database Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleClearDatabase('queue')}
                        disabled={isClearing}
                      >
                        Clear Queue
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleClearDatabase('results')}
                        disabled={isClearing}
                      >
                        Clear Results
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleClearDatabase('all')}
                        disabled={isClearing}
                        className="flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Clear All Data
                      </Button>
                      <Button
                        variant="outline"
                        onClick={refreshStats}
                        className="ml-auto"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Stats
                      </Button>
                    </div>
                    
                    <Alert>
                      <Database className="h-4 w-4" />
                      <AlertTitle>Database Management</AlertTitle>
                      <AlertDescription>
                        Clearing data will permanently remove processed documents and their results.
                        Make sure to export any important data before clearing.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex items-center justify-end border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

