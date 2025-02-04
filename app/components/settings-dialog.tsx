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
      <DialogContent className="sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="space-y-2 px-0">
          <DialogTitle>⚙️ Settings</DialogTitle>
          <DialogDescription className="text-xs">
            Customize how your text recognition app works. We'll help you understand each option! 
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mr-6 pr-6 my-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-5 sticky top-0 bg-background z-10 mb-6">
              <TabsTrigger value="ocr" className="text-sm px-1">OCR</TabsTrigger>
              <TabsTrigger value="processing" className="text-sm px-1">Processing</TabsTrigger>
              <TabsTrigger value="upload" className="text-sm px-1">Upload</TabsTrigger>
              <TabsTrigger value="display" className="text-sm px-1">Display</TabsTrigger>
              <TabsTrigger value="database" className="text-sm px-1">Storage</TabsTrigger>
            </TabsList>

            <div className="px-1">
              <TabsContent value="ocr" className="space-y-4 mt-0 mb-6">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="provider" className="text-sm">🤖 Text Recognition Service</Label>
                    <p className="text-xs text-muted-foreground">Pick which AI service will read your documents. Both Google and Microsoft are great at this!</p>
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
                    <Label htmlFor="api-key" className="text-sm">🔑 Access Key</Label>
                    <p className="text-xs text-muted-foreground">Think of this as your VIP pass to use the service. Keep it secret!</p>
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
                    <div className="space-y-1.5">
                      <Label htmlFor="region" className="text-sm">🌍 Service Location</Label>
                      <p className="text-xs text-muted-foreground">Pick the closest region for best speed (e.g., 'westeurope')</p>
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
                    <Label htmlFor="language" className="text-sm">🗣️ Document Language</Label>
                    <p className="text-xs text-muted-foreground">Select your document's main language for better accuracy</p>
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

              <TabsContent value="processing" className="space-y-4 mt-0 mb-6">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="max-concurrent-jobs" className="text-sm">📚 Parallel Processing</Label>
                    <p className="text-xs text-muted-foreground">Process multiple documents at once (e.g., setting 3 means processing book1.pdf, book2.pdf, and book3.pdf simultaneously)</p>
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
                    <Label htmlFor="pages-per-chunk" className="text-sm">📄 Pages Per Batch</Label>
                    <p className="text-xs text-muted-foreground">How many pages to group together (e.g., setting 3 means processing pages 1-3, then 4-6, then 7-9 of a document)</p>
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
                    <Label htmlFor="concurrent-chunks" className="text-sm">🚀 Processing Speed</Label>
                    <p className="text-xs text-muted-foreground">How many page groups to process at once (e.g., setting 2 means processing pages 1-3 and 4-6 simultaneously)</p>
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
                    <Label htmlFor="retry-attempts" className="text-sm">🔄 Auto-Retry</Label>
                    <p className="text-xs text-muted-foreground">Number of retry attempts if processing fails</p>
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
                    <Label htmlFor="retry-delay" className="text-sm">⏲️ Retry Timing</Label>
                    <p className="text-xs text-muted-foreground">Wait time between retries (in milliseconds)</p>
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
                    <Label htmlFor="max-file-size" className="text-sm">📦 Maximum File Size</Label>
                    <p className="text-xs text-muted-foreground">Largest allowed file size (MB). Typical 20-page PDF: 2-3 MB</p>
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

                  <div className="space-y-1.5">
                    <Label htmlFor="allowed-file-types" className="text-sm">📎 Accepted Files</Label>
                    <p className="text-xs text-muted-foreground">File types allowed (e.g., pdf, png, jpg)</p>
                    <Input
                      id="allowed-file-types"
                      value={settings.upload.allowedFileTypes.join(", ")}
                      onChange={(e) => settings.updateUploadSettings({ 
                        allowedFileTypes: e.target.value.split(",").map(type => type.trim()) 
                      })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="max-simultaneous-uploads" className="text-sm">⬆️ Upload Speed</Label>
                    <p className="text-xs text-muted-foreground">Number of files to upload at once</p>
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

              <TabsContent value="display" className="space-y-4 mt-0 mb-6">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="theme" className="text-sm">🎨 App Look</Label>
                    <p className="text-xs text-muted-foreground">Choose light, dark, or system theme</p>
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

                  <div className="space-y-1.5">
                    <Label htmlFor="font-size" className="text-sm">📝 Text Size</Label>
                    <p className="text-xs text-muted-foreground">Adjust text size for comfortable reading</p>
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
                    <Label htmlFor="show-confidence" className="text-sm">🎯 Show Accuracy</Label>
                    <p className="text-xs text-muted-foreground ml-2">Display confidence level for each word</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="highlight-uncertain"
                      checked={settings.display.highlightUncertain}
                      onChange={(e) => settings.updateDisplaySettings({ highlightUncertain: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="highlight-uncertain" className="text-sm">🔍 Mark Uncertain</Label>
                    <p className="text-xs text-muted-foreground ml-2">Highlight less confident text</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="database" className="space-y-4 mt-0 mb-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm">📊 Storage Stats</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-2">
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
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm">🧹 Auto-Cleanup</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="auto-cleanup"
                            checked={settings.database.autoCleanup}
                            onChange={(e) => settings.updateDatabaseSettings({ autoCleanup: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <Label htmlFor="auto-cleanup" className="text-sm">Auto Cleanup</Label>
                          <p className="text-xs text-muted-foreground ml-2">Auto remove old files</p>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="retention-period" className="text-sm">📅 Keep For</Label>
                          <p className="text-xs text-muted-foreground">Days to keep files (e.g., 30)</p>
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
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm">Database Management</CardTitle>
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
            </div>
          </Tabs>
        </div>

        <div className="flex items-center justify-end border-t pt-6 px-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

