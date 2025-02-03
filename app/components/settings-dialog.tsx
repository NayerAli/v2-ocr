"use client"

import { useState } from "react"
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { useSettings } from "@/store/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CONFIG } from "@/config/constants"
import { validateGoogleApiKey, validateMicrosoftApiKey } from "@/lib/api-validation"
import { useToast } from "@/hooks/use-toast"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px]">
        <DialogHeader className="space-y-3">
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription>
            Configure your OCR API provider settings. You can process documents without API configuration, but they will
            remain in queue until API is properly set up.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
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

          <div className="space-y-4">
            <Label>Processing Settings</Label>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="batch-size">Batch Size</Label>
                  <span className="text-sm text-muted-foreground">{settings.ocr.batchSize} pages</span>
                </div>
                <Slider
                  id="batch-size"
                  min={1}
                  max={50}
                  step={1}
                  value={[settings.ocr.batchSize]}
                  onValueChange={([value]) => settings.updateOCRSettings({ batchSize: value })}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">Number of pages to process at once for large documents</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="concurrent">Concurrent Processing</Label>
                  <span className="text-sm text-muted-foreground">{settings.ocr.maxConcurrent} files</span>
                </div>
                <Slider
                  id="concurrent"
                  min={1}
                  max={5}
                  step={1}
                  value={[settings.ocr.maxConcurrent]}
                  onValueChange={([value]) => settings.updateOCRSettings({ maxConcurrent: value })}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">Number of files to process simultaneously</p>
              </div>
            </div>
          </div>

          {validationError && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Error</AlertTitle>
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

