"use client"

import { useState } from "react"
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { useSettings } from "@/store/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CONFIG } from "@/config/constants"
import { validateGoogleApiKey, validateMicrosoftApiKey } from "@/lib/api-validation"

export default function SettingsPage() {
  const settings = useSettings()
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
      }
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>OCR API Settings</CardTitle>
            <CardDescription>Configure your OCR API provider settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider">API Provider</Label>
                <Select
                  value={settings.ocr.provider}
                  onValueChange={(value: (typeof CONFIG.SUPPORTED_APIS)[number]) => {
                    settings.updateOCRSettings({
                      provider: value,
                      apiKey: "", // Reset API key when changing provider
                      region: "", // Reset region when changing provider
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
                <Label htmlFor="api-key">
                  {settings.ocr.provider === "google" ? "Google API Key" : "Azure API Key"}
                </Label>
                <div className="flex gap-2">
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
                  >
                    {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isValid === true ? <span className="text-green-500 mr-2">✓</span> : null}
                    Test API Key
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
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the region where your Azure Computer Vision resource is deployed.
                  </p>
                </div>
              )}

              {validationError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Error</AlertTitle>
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
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
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

