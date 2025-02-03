"use client"

import { useSettings } from "@/store/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CONFIG } from "@/config/constants"

export function SettingsPanel() {
  const settings = useSettings()

  return (
    <div className="space-y-6">
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
                onValueChange={(value) =>
                  settings.updateOCRSettings({
                    provider: value as (typeof CONFIG.SUPPORTED_APIS)[number],
                  })
                }
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
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={settings.ocr.apiKey}
                onChange={(e) => settings.updateOCRSettings({ apiKey: e.target.value })}
              />
            </div>

            {settings.ocr.provider === "microsoft" && (
              <div className="space-y-2">
                <Label htmlFor="region">Azure Region</Label>
                <Input
                  id="region"
                  value={settings.ocr.region || ""}
                  onChange={(e) => settings.updateOCRSettings({ region: e.target.value })}
                />
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
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="auto">Auto Detect</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Settings</CardTitle>
          <CardDescription>Configure how processed files are exported</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="format">Export Format</Label>
              <Select
                value={settings.export.format}
                onValueChange={(value) =>
                  settings.updateExportSettings({
                    format: value as "txt" | "json" | "csv",
                  })
                }
              >
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="txt">Plain Text (.txt)</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="naming">File Naming Pattern</Label>
              <Input
                id="naming"
                value={settings.export.naming}
                onChange={(e) => settings.updateExportSettings({ naming: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Available variables: {"{filename}"}, {"{timestamp}"}, {"{date}"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={settings.resetSettings}>
          Reset to Defaults
        </Button>
        <Button>Save Changes</Button>
      </div>
    </div>
  )
}

