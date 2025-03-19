"use client"

import { FileText, Clock, AlertCircle, CheckCircle2, XCircle, Loader2, Settings, ImageIcon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { formatFileSize, formatDuration, formatTimestamp } from "@/lib/file-utils"
import { useSettings } from "@/hooks/use-settings"
import type { ProcessingStatus, OCRResult } from "@/types"
import { useLanguage } from "@/hooks/use-language"
import { t } from "@/lib/i18n/translations"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { serverStorage } from "@/lib/client/server-storage-service"

interface DocumentDetailsDialogProps {
  document: ProcessingStatus | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentDetailsDialog({ document, open, onOpenChange }: DocumentDetailsDialogProps) {
  const settings = useSettings()
  const { language } = useLanguage()
  const [localDoc, setLocalDoc] = useState<ProcessingStatus | null>(document)
  const router = useRouter()
  const [results, setResults] = useState<OCRResult[]>([])
  const [isLoadingResults, setIsLoadingResults] = useState(false)

  // Update local document state when document prop changes
  useEffect(() => {
    if (document) {
      setLocalDoc(document)
    }
  }, [document])

  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(
      language === 'ar' ? 'ar-EG' : language === 'fa' ? 'fa-IR' : undefined,
      { 
        year: 'numeric', 
        month: 'numeric', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    )
  }

  // Poll for updates if document is processing and dialog is open
  useEffect(() => {
    if (!open || !document || !['processing', 'queued'].includes(document.status)) {
      return
    }
    
    const interval = setInterval(async () => {
      try {
        const status = await serverStorage.getStatus(document.id)
        if (status) {
          setLocalDoc(status)
        }
      } catch (error) {
        console.error('Error polling document status:', error)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [document, open])

  // Load results when document changes
  useEffect(() => {
    async function loadResults() {
      if (!document || !document.id) return
      
      // Always attempt to load results for completed or error status documents
      if (document.status === "completed" || document.status === "error") {
        setIsLoadingResults(true)
        try {
          const response = await fetch(`/api/results/${document.id}`)
          if (!response.ok) throw new Error('Failed to load results')
          const data = await response.json()
          setResults(data.results || [])
        } catch (error) {
          console.error('Error loading results:', error)
        } finally {
          setIsLoadingResults(false)
        }
      } else {
        // Clear results for other statuses
        setResults([])
      }
    }

    loadResults()
  }, [document])

  // Ensure settings values are never undefined
  const safeSettings = {
    ocr: {
      provider: settings.ocr?.provider || "google",
      apiKey: settings.ocr?.apiKey || "",
      region: settings.ocr?.region || "",
      language: settings.ocr?.language || "en",
    },
    processing: {
      maxConcurrentJobs: settings.processing?.maxConcurrentJobs || 1,
      pagesPerChunk: settings.processing?.pagesPerChunk || 2,
      concurrentChunks: settings.processing?.concurrentChunks || 1,
      retryAttempts: settings.processing?.retryAttempts || 2,
      retryDelay: settings.processing?.retryDelay || 1000,
    },
    upload: {
      maxFileSize: settings.upload?.maxFileSize || 500,
      allowedFileTypes: settings.upload?.allowedFileTypes || ['.pdf', '.jpg', '.jpeg', '.png'],
      maxSimultaneousUploads: settings.upload?.maxSimultaneousUploads || 5,
    }
  }

  if (!document || !localDoc) return null

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
    switch (safeSettings.ocr.provider) {
      case "google":
        return "Google Cloud Vision"
      case "microsoft":
        return "Microsoft Azure Vision"
      default:
        return "Not specified"
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            <div className="flex items-center gap-2">
              {localDoc.type && localDoc.type.startsWith('image/') 
                ? <ImageIcon className="h-5 w-5" /> 
                : <FileText className="h-5 w-5" />}
              <span className="truncate">{localDoc.filename}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('details', language)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('status', language)}</span>
                  <span className={`font-medium flex items-center gap-2 ${getStatusColor(localDoc.status)}`}>
                    {getStatusIcon(localDoc.status)}
                    {localDoc.status.charAt(0).toUpperCase() + localDoc.status.slice(1)}
                  </span>
                </div>
                
                {localDoc.status === "processing" && (
                  <div className="mt-2 mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{t('progress', language)}</span>
                      <span>{typeof localDoc.progress === 'number' ? `${Math.round(localDoc.progress)}%` : ''}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${typeof localDoc.progress === 'number' ? Math.max(1, localDoc.progress) : 1}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 text-center">
                      {t('page', language)} {localDoc.currentPage || 0} / {localDoc.totalPages || 1}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('provider', language)}</span>
                  <span className="font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    {getProviderName()}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('language', language)}</span>
                  <span className="font-medium">{safeSettings.ocr.language?.toUpperCase() ?? 'AUTO'}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">{t('startTime', language)}</span>
                  <span className="font-medium">
                    {localDoc.startTime ? formatTimestamp(localDoc.startTime) : t('notStarted', language)}
                  </span>
                </div>
                {localDoc.endTime && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">{t('endTime', language)}</span>
                    <span className="font-medium">
                      {formatTimestamp(localDoc.endTime)}
                    </span>
                  </div>
                )}
                {localDoc.completionTime && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">{t('totalDuration', language)}</span>
                    <span className="font-medium">
                      {formatDuration(localDoc.completionTime - (localDoc.startTime || 0))}
                    </span>
                  </div>
                )}
                {localDoc.error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('errorDetails', language)}</AlertTitle>
                    <AlertDescription>{localDoc.error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="md:col-span-5 space-y-4">
            <Tabs defaultValue="info" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">{t('fileInformation', language)}</TabsTrigger>
                <TabsTrigger value="processing">{t('processingDetails', language)}</TabsTrigger>
                <TabsTrigger value="results">{t('ocrResults', language)}</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t('basicInfo', language)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">{t('fileName', language)}</span>
                      <span className="font-medium">{localDoc.filename}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">{t('fileType', language)}</span>
                      <span className="font-medium">{localDoc.metadata?.type || localDoc.filename.split('.').pop()?.toUpperCase() || t('unknown', language)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">{t('fileSize', language)}</span>
                      <span className="font-medium">{formatFileSize(localDoc.size ?? 0, language)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">{t('totalPages', language)}</span>
                      <span className="font-medium">{localDoc.totalPages || t('unknown', language)}</span>
                    </div>
                    {localDoc.metadata && Object.entries(localDoc.metadata)
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
                    <CardTitle className="text-lg">{t('processingConfiguration', language)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm text-muted-foreground">{t('concurrentJobs', language)}</span>
                        <span className="font-medium">{safeSettings.processing.maxConcurrentJobs}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm text-muted-foreground">{t('pagesPerChunk', language)}</span>
                        <span className="font-medium">{safeSettings.processing.pagesPerChunk}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm text-muted-foreground">{t('concurrentChunks', language)}</span>
                        <span className="font-medium">{safeSettings.processing.concurrentChunks}</span>
                      </div>
                      {localDoc.progress && Object.entries(localDoc.progress).map(([key, value]) => (
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

              <TabsContent value="results" className="space-y-4 mt-4">
                {isLoadingResults ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : results.length > 0 ? (
                  <div className="space-y-4">
                    {localDoc.status === "error" && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{t('processingError', language)}</AlertTitle>
                        <AlertDescription>
                          {localDoc.error || t('processingErrorDesc', language)}
                        </AlertDescription>
                      </Alert>
                    )}
                    {results.map((result, index) => (
                      <Card key={result.id || index}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span>{t('page', language)} {result.pageNumber}</span>
                            <span className="text-sm text-muted-foreground">
                              {t('confidence', language)}: {Math.round(result.confidence * 100)}%
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {result.imageUrl && (
                            <div className="relative aspect-[16/9] overflow-hidden rounded-md">
                              <img 
                                src={result.imageUrl} 
                                alt={`Page ${result.pageNumber}`}
                                className="object-contain w-full h-full"
                              />
                            </div>
                          )}
                          <div className="relative">
                            <div className="absolute -inset-2 bg-muted/50 rounded-lg -z-10" />
                            <pre className="text-sm whitespace-pre-wrap break-words font-mono p-4">
                              {result.text || t('noTextExtracted', language)}
                            </pre>
                          </div>
                          {result.error && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertTitle>{t('error', language)}</AlertTitle>
                              <AlertDescription>{result.error}</AlertDescription>
                            </Alert>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">{t('noResultsAvailable', language)}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close', language)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 