"use client"

import { FileText, Clock, AlertCircle, CheckCircle2, XCircle, Loader2, Settings } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { formatFileSize, formatDuration, formatTimestamp } from "@/lib/file-utils"
import { useSettings } from "@/store/settings"
import type { ProcessingStatus } from "@/types"
import { useLanguage } from "@/hooks/use-language"
import { t } from "@/lib/i18n/translations"

interface DocumentDetailsDialogProps {
  document: ProcessingStatus | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentDetailsDialog({ document, open, onOpenChange }: DocumentDetailsDialogProps) {
  const settings = useSettings()
  const { language } = useLanguage()

  if (!document) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-500 dark:text-green-400"
      case "processing":
        return "text-blue-500 dark:text-blue-400"
      case "error":
        return "text-red-500 dark:text-red-400"
      case "queued":
        return "text-yellow-500 dark:text-yellow-400"
      default:
        return "text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin" />
      case "error":
        return <XCircle className="h-4 w-4" />
      case "queued":
        return <Clock className="h-4 w-4" />
      default:
        return null
    }
  }

  const getProviderName = () => {
    switch (settings.ocr.provider) {
      case "google":
        return "Google Cloud Vision"
      case "microsoft":
        return "Microsoft Azure Vision"
      default:
        return "Not specified"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('documentDetails', language)}
          </DialogTitle>
          <DialogDescription>
            {t('technicalDetails', language)}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">{t('fileInformation', language)}</TabsTrigger>
            <TabsTrigger value="processing">{t('processingDetails', language)}</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{t('basicInfo', language)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('fileName', language)}</span>
                  <span className="font-medium">{document.filename}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('fileType', language)}</span>
                  <span className="font-medium">{document.metadata?.type || document.filename.split('.').pop()?.toUpperCase() || t('unknown', language)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('fileSize', language)}</span>
                  <span className="font-medium">{formatFileSize(document.size ?? 0, language)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('totalPages', language)}</span>
                  <span className="font-medium">{document.totalPages || t('unknown', language)}</span>
                </div>
                {document.metadata && Object.entries(document.metadata)
                  .filter(([key]) => !['type', 'created', 'modified'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">
                        {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")}
                      </span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="processing" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{t('processingInfo', language)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('status', language)}</span>
                  <span className={`font-medium flex items-center gap-2 ${getStatusColor(document.status)}`}>
                    {getStatusIcon(document.status)}
                    {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('provider', language)}</span>
                  <span className="font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    {getProviderName()}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('language', language)}</span>
                  <span className="font-medium">{settings.ocr.language?.toUpperCase() ?? 'AUTO'}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('startTime', language)}</span>
                  <span className="font-medium">
                    {document.startTime ? formatTimestamp(document.startTime) : t('notStarted', language)}
                  </span>
                </div>
                {document.completionTime && (
                  <>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">{t('endTime', language)}</span>
                      <span className="font-medium">
                        {document.endTime ? formatTimestamp(document.endTime) : t('notCompleted', language)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">{t('totalDuration', language)}</span>
                      <span className="font-medium">
                        {formatDuration(document.completionTime - (document.startTime || 0))}
                      </span>
                    </div>
                  </>
                )}
                {document.error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('errorDetails', language)}</AlertTitle>
                    <AlertDescription>{document.error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{t('processingConfiguration', language)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">{t('concurrentJobs', language)}</span>
                    <span className="font-medium">{settings.processing.maxConcurrentJobs}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">{t('pagesPerChunk', language)}</span>
                    <span className="font-medium">{settings.processing.pagesPerChunk}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">{t('concurrentChunks', language)}</span>
                    <span className="font-medium">{settings.processing.concurrentChunks}</span>
                  </div>
                  {document.progress && Object.entries(document.progress).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">
                        {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")}
                      </span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close', language)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 