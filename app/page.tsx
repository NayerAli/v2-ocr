"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Upload, CheckCircle, AlertCircle, ArrowRight, Clock } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FileUpload } from "./components/file-upload"
import { SettingsDialog } from "./components/settings-dialog"
import type { ProcessingStatus } from "@/types"
import { useSettings } from "@/store/settings"
import { useSettingsInit } from "@/hooks/use-settings-init"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { db } from "@/lib/indexed-db"
import { ProcessingService } from "@/lib/processing-service"
import { formatFileSize } from "@/lib/file-utils"
import { initializePDFJS } from "@/lib/pdf-init"
import { DocumentDetailsDialog } from "./components/document-details-dialog"
import { DocumentList } from "./components/document-list"
import { useLanguage } from "@/hooks/use-language"
import { t, tCount, translationKeys, type Language } from "@/lib/i18n/translations"

interface DashboardStats {
  totalProcessed: number
  avgProcessingTime: number
  successRate: number
  totalStorage: number
}

function toArabicNumerals(num: number | string, language: Language): string {
  if (language !== 'ar' && language !== 'fa') return String(num)
  
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)])
}

export default function DashboardPage() {
  const router = useRouter()
  const settings = useSettings()
  const { toast } = useToast()
  const { language } = useLanguage()
  const { isInitialized, isConfigured, shouldShowSettings, setShouldShowSettings } = useSettingsInit()
  const [processingQueue, setProcessingQueue] = useState<ProcessingStatus[]>([])
  const [isDraggingOverPage, setIsDraggingOverPage] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalProcessed: 0,
    avgProcessingTime: 0,
    successRate: 0,
    totalStorage: 0,
  })
  const [selectedDocument, setSelectedDocument] = useState<ProcessingStatus | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  // Create processing service with current settings
  const processingService = useMemo(
    () => ProcessingService.getInstance({
      ocr: settings.ocr,
      processing: settings.processing,
      upload: settings.upload
    }),
    [settings.ocr, settings.processing, settings.upload]
  )

  // Initialize PDF.js only after settings are loaded
  useEffect(() => {
    if (isInitialized) {
      initializePDFJS()
    }
  }, [isInitialized])

  // Load queue and update stats
  useEffect(() => {
    let isMounted = true

    const loadQueue = async (isInitialLoad = false) => {
      if (!isInitialized) return

      try {
        if (isInitialLoad) {
          setIsLoadingData(true)
        }

        // Load queue first and update UI immediately
        const queue = await db.getQueue()
        if (!isMounted) return
        setProcessingQueue(queue)

        // Then load stats in the background
        const dbStats = await db.getDatabaseStats()
        if (!isMounted) return

        // Update stats after both are loaded
        const completed = queue.filter((item) => item.status === "completed")
        const totalProcessed = completed.length
        const avgTime = completed.reduce((acc, item) => {
          return acc + ((item.endTime || 0) - (item.startTime || 0))
        }, 0) / (totalProcessed || 1)

        setStats({
          totalProcessed,
          avgProcessingTime: avgTime,
          successRate: queue.length ? (totalProcessed / queue.length) * 100 : 0,
          totalStorage: dbStats.dbSize
        })
      } catch (error) {
        console.error("Error loading queue:", error)
      } finally {
        if (isMounted && isInitialLoad) {
          setIsLoadingData(false)
        }
      }
    }

    // Initial load with loading state
    loadQueue(true)
    
    // Setup polling without loading state
    const interval = setInterval(() => loadQueue(false), 3000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isInitialized])

  const handleFilesAccepted = async (files: File[]) => {
    try {
      const ids = await processingService.addToQueue(files)
      const newItems = await Promise.all(ids.map((id) => processingService.getStatus(id)))
      setProcessingQueue((prev) => [...prev, ...newItems.filter((item): item is ProcessingStatus => !!item)])

      const message = tCount('filesAddedDesc', files.length, language).replace(/\d+/g, num => 
        toArabicNumerals(num, language)
      )

      toast({
        title: t('filesAdded', language),
        description: message,
      })
    } catch (error) {
      toast({
        title: t('uploadError', language),
        description: error instanceof Error ? error.message : t(translationKeys.failedProcess, language),
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromQueue = async (id: string) => {
    try {
      const status = processingQueue.find(item => item.id === id)
      if (!status) return

      // If the file is processing, cancel it first
      if (status.status === "processing") {
        await processingService.cancelProcessing(id)
      }

      // Remove from active queue but keep in recent documents
      setProcessingQueue(prev => prev.map(item => 
        item.id === id 
          ? { ...item, status: "cancelled" }
          : item
      ))

      toast({
        title: "File Removed",
        description: status.status === "processing" 
          ? "Processing cancelled and document removed from queue"
          : "Document removed from queue",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove document from queue",
        variant: "destructive",
      })
    }
  }

  const handleViewResults = async (id: string) => {
    router.push(`/documents/${id}`)
  }

  const handleCancel = async (id: string) => {
    try {
      await processingService.cancelProcessing(id)
      
      // Update the queue item status
      setProcessingQueue(prev => prev.map(item => 
        item.id === id 
          ? { ...item, status: "cancelled" }
          : item
      ))

      toast({
        title: "Processing Cancelled",
        description: "Document processing has been cancelled",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to cancel processing",
        variant: "destructive",
      })
    }
  }

  // Add loading skeletons for stats cards
  const renderStatsCard = (title: string, icon: React.ReactNode, content: React.ReactNode) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoadingData || !processingQueue.length ? (
          <div className="space-y-2">
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        ) : content}
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen">
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t('welcome', language)}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{t('dashboardTitle', language)}</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            {t('dashboardDescription', language)}
          </p>
        </div>

        {!isConfigured && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('configureRequired', language)}</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-2">{t('configureMessage', language)}</p>
              <Button variant="secondary" size="sm" onClick={() => setShouldShowSettings(true)}>
                {t('configureSettings', language)}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Upload Section */}
        <div className="relative">
          <Card className={cn(
            "border-dashed transition-all duration-300",
            isDraggingOverPage && "ring-2 ring-primary shadow-lg"
          )}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className={cn(
                  "h-5 w-5 transition-colors duration-300",
                  isDraggingOverPage ? "text-primary" : "text-primary/80"
                )} />
                {t('uploadDocuments', language)}
              </CardTitle>
              <CardDescription>
                {t('uploadDescription', language)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFilesAccepted={handleFilesAccepted}
                processingQueue={processingQueue}
                onPause={async () => {
                  await processingService.pauseQueue()
                  toast({
                    title: t('processingCancelled', language),
                    description: t('processingCancelledDesc', language),
                  })
                }}
                onResume={async () => {
                  await processingService.resumeQueue()
                  toast({
                    title: t('processingCancelled', language),
                    description: t('processingCancelledDesc', language),
                  })
                }}
                onRemove={handleRemoveFromQueue}
                onCancel={handleCancel}
                disabled={!isConfigured || !isInitialized}
                maxFileSize={settings.upload.maxFileSize}
                maxSimultaneousUploads={settings.upload.maxSimultaneousUploads}
                allowedFileTypes={settings.upload.allowedFileTypes}
                isPageDragging={isDraggingOverPage}
                onDragStateChange={setIsDraggingOverPage}
                language={language}
              />
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {renderStatsCard(
            t('totalDocuments', language),
            <FileText className="h-4 w-4 text-muted-foreground" />,
            <>
              <div className="text-2xl font-bold">{toArabicNumerals(processingQueue.length, language)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {toArabicNumerals(stats.totalProcessed, language)} {t('processed', language)} • {formatFileSize(stats.totalStorage * 1024 * 1024, language)} {t('used', language)}
              </p>
            </>
          )}

          {renderStatsCard(
            t('processingStatus', language),
            <Upload className="h-4 w-4 text-muted-foreground" />,
            <>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">
                  {toArabicNumerals(processingQueue.filter((item) => item.status === "processing").length, language)}
                </div>
                {processingQueue.some(doc => doc.rateLimitInfo?.isRateLimited) && (
                  <Clock className="h-5 w-5 text-purple-500 animate-pulse" />
                )}
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-xs text-muted-foreground">
                  {toArabicNumerals(processingQueue.filter((item) => item.status === "queued").length, language)} {t('queued', language)}
                </p>
                {processingQueue.some(doc => doc.rateLimitInfo?.isRateLimited) && (
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    {t('rateLimited', language)} • {t('autoResuming', language)}
                  </p>
                )}
              </div>
            </>
          )}

          {renderStatsCard(
            t('successRate', language),
            <CheckCircle className="h-4 w-4 text-muted-foreground" />,
            <>
              <div className="text-2xl font-bold">{toArabicNumerals(stats.successRate.toFixed(1), language)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {toArabicNumerals(Math.round(stats.avgProcessingTime / 1000), language)}s {t('processed', language)}
              </p>
            </>
          )}

          {renderStatsCard(
            t('processingSpeed', language),
            <AlertCircle className="h-4 w-4 text-muted-foreground" />,
            <>
              <div className="text-2xl font-bold">
                {toArabicNumerals(settings.processing.maxConcurrentJobs * settings.processing.pagesPerChunk, language)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('pagesPerBatch', language)} • {toArabicNumerals(settings.processing.concurrentChunks, language)} {t('chunks', language)}
              </p>
            </>
          )}
        </div>

        {/* Recent Documents */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('recentDocuments', language)}</CardTitle>
                <CardDescription>{t('recentDescription', language)}</CardDescription>
              </div>
              {processingQueue.length > 5 && (
                <Button variant="outline" size="sm" onClick={() => router.push('/documents')}>
                  {t('viewAll', language)}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent data-section="recent-documents">
            {isLoadingData ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <DocumentList
                documents={processingQueue.slice(0, 5)}
                onShowDetails={(doc) => {
                  setSelectedDocument(doc)
                  setIsDetailsOpen(true)
                }}
                onDownload={handleViewResults}
                onDelete={handleRemoveFromQueue}
                variant="grid"
                showHeader={false}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <DocumentDetailsDialog
        document={selectedDocument}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />
      <SettingsDialog 
        open={shouldShowSettings} 
        onOpenChange={(open) => {
          setShouldShowSettings(open)
          if (!open && isConfigured) {
            router.refresh()
          }
        }}
      />
    </div>
  )
}

