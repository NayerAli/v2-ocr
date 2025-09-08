"use client"

import React, { useState, useEffect, useRef } from "react"
import { debugLog, debugError } from "@/lib/log"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Upload, CheckCircle, AlertCircle, ArrowRight, Clock, LogIn } from "lucide-react"
import { FileUpload } from "./components/file-upload"
import type { ProcessingStatus } from "@/types"
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings"
import { useSettings } from "@/store/settings"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { db } from "@/lib/database"
import { getProcessingService } from "@/lib/processing-service"
import { formatFileSize } from "@/lib/file-utils"
import { initializePDFJS } from "@/lib/pdf-init"
import { DocumentDetailsDialog } from "./components/document-details-dialog"
import { DocumentList } from "./components/document-list"
import { SupabaseError } from "./components/supabase-error"
import { useLanguage } from "@/hooks/use-language"
import { t, tCount, translationKeys, type Language } from "@/lib/i18n/translations"
import { useAuth } from "@/components/auth/auth-provider"
import Link from "next/link"
import { retryDocument } from "@/lib/tests/document-status-validation"

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
  const { user, isLoading: isAuthLoading } = useAuth()
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

  // Reference to hold the processing service
  interface ProcessingService {
    addToQueue: (files: File[]) => Promise<string[]>;
    getStatus: (id: string) => Promise<ProcessingStatus | undefined>;
    cancelProcessing: (id: string) => Promise<void>;
    pauseQueue: () => Promise<void>;
    resumeQueue: () => Promise<void>;
    updateSettings: (settings: { ocr: OCRSettings; processing: ProcessingSettings; upload: UploadSettings }) => Promise<void>;
    retryDocument: (id: string) => Promise<ProcessingStatus | null>;
  }

  const processingServiceRef = useRef<ProcessingService | null>(null)

  // Initialize processing service
  useEffect(() => {
    const initProcessingService = async () => {
      debugLog('[DEBUG] Creating processing service with settings:');
      debugLog('[DEBUG] OCR settings:', settings.ocr);
      debugLog('[DEBUG] Processing settings:', settings.processing);
      debugLog('[DEBUG] Upload settings:', settings.upload);

      const service = await getProcessingService({
        ocr: settings.ocr,
        processing: settings.processing,
        upload: settings.upload
      });

      processingServiceRef.current = service;
      debugLog('[DEBUG] Processing service initialized');
    };

    initProcessingService().catch(err => {
      debugError('[DEBUG] Error initializing processing service:', err);
    });
  }, [settings.ocr, settings.processing, settings.upload])

  // Initialize PDF.js
  useEffect(() => {
    initializePDFJS()
  }, [])

  // Load queue and update stats
  useEffect(() => {
    let isMounted = true

    const loadQueue = async (isInitialLoad = false) => {
      // Only log on initial load or in development mode
      if (isInitialLoad && process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] loadQueue called, isInitialLoad:', isInitialLoad);
        debugLog('[DEBUG] isAuthenticated:', !!user);
      }

      // Skip loading queue if user is not authenticated
      if (!user && !isAuthLoading) {
        if (isInitialLoad && process.env.NODE_ENV === 'development') {
          debugLog('[DEBUG] User not authenticated, skipping queue load');
        }
        setIsLoadingData(false);
        return;
      }

      try {
        if (isInitialLoad) {
          if (process.env.NODE_ENV === 'development') {
            debugLog('[DEBUG] Initial load, setting loading state');
          }
          setIsLoadingData(true);
        }

        // Load queue first and update UI immediately
        if (isInitialLoad && process.env.NODE_ENV === 'development') {
          debugLog('[DEBUG] Loading queue from database');
        }
        const queue = await db.getQueue();
        if (isInitialLoad && process.env.NODE_ENV === 'development') {
          debugLog('[DEBUG] Queue loaded, items:', queue.length);
        }

        if (!isMounted) {
          if (isInitialLoad && process.env.NODE_ENV === 'development') {
            debugLog('[DEBUG] Component unmounted, aborting update');
          }
          return;
        }

        if (isInitialLoad && process.env.NODE_ENV === 'development') {
          debugLog('[DEBUG] Updating processing queue state');
        }
        setProcessingQueue(queue);

        // Then load stats in the background
        const dbStats = await db.getDatabaseStats()
        if (!isMounted) return

        // Update stats after both are loaded
        const completed = queue.filter((item) => item.status === "completed")
        const failed = queue.filter((item) => item.status === "error" || item.status === "failed")
        const totalProcessed = completed.length + failed.length
        const avgTime = completed.reduce((acc, item) => {
          return acc + ((item.processingCompletedAt?.getTime() || 0) - (item.processingStartedAt?.getTime() || 0))
        }, 0) / (completed.length || 1)

        setStats({
          totalProcessed,
          avgProcessingTime: avgTime,
          successRate: totalProcessed ? (completed.length / totalProcessed) * 100 : 0,
          totalStorage: dbStats.dbSize
        })
      } catch (error) {
        debugError("Error loading queue:", error)
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
  }, [user, isAuthLoading])

  const handleFilesAccepted = async (files: File[]) => {
    if (process.env.NODE_ENV === 'development') {
      debugLog('[DEBUG] handleFilesAccepted called with', files.length, 'files');
    }
    try {
      // Check if processing service is initialized
      if (!processingServiceRef.current) {
        throw new Error('Processing service not initialized');
      }

      if (process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] Calling processingService.addToQueue');
      }
      const ids = await processingServiceRef.current.addToQueue(files)
      if (process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] processingService.addToQueue returned IDs:', ids);
      }

      if (process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] Getting status for each file');
      }
      const newItems = await Promise.all(ids.map((id) => processingServiceRef.current!.getStatus(id)))
      if (process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] Got status for files:', newItems.length);
      }

      const validItems = newItems.filter((item): item is ProcessingStatus => !!item);
      if (process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] Valid items:', validItems.length);
      }

      setProcessingQueue((prev) => {
        if (process.env.NODE_ENV === 'development') {
          debugLog('[DEBUG] Previous queue length:', prev.length);
        }
        const newQueue = [...prev, ...validItems];
        if (process.env.NODE_ENV === 'development') {
          debugLog('[DEBUG] New queue length:', newQueue.length);
        }
        return newQueue;
      })

      const message = tCount('filesAddedDesc', files.length, language).replace(/\d+/g, num =>
        toArabicNumerals(num, language)
      )

      if (process.env.NODE_ENV === 'development') {
        debugLog('[DEBUG] Showing toast notification');
      }
      toast({
        title: t('filesAdded', language),
        description: message,
      })
    } catch (error) {
      debugError('[DEBUG] Error in handleFilesAccepted:', error);
      toast({
        title: t('uploadError', language),
        description: error instanceof Error ? error.message : t(translationKeys.failedProcess, language),
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromQueue = async (id: string) => {
    try {
      // Check if processing service is initialized
      if (!processingServiceRef.current) {
        throw new Error('Processing service not initialized');
      }

      const status = processingQueue.find(item => item.id === id)
      if (!status) return

      // If the file is processing, cancel it first
      if (status.status === "processing") {
        await processingServiceRef.current.cancelProcessing(id)
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
      // Check if processing service is initialized
      if (!processingServiceRef.current) {
        throw new Error('Processing service not initialized');
      }

      await processingServiceRef.current.cancelProcessing(id)

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

  const handleRetry = async (id: string) => {
    try {
      console.log('[DEBUG] Retrying document:', id);

      // Find the document
      const doc = processingQueue.find(d => d.id === id);
      if (!doc) {
        console.error('[DEBUG] Document not found for retry:', id);
        return;
      }

      // Use our centralized retry function
      console.log('[DEBUG] Using centralized retry function');
      // Retry the document
      const updatedDoc = await retryDocument(id);

      if (!updatedDoc) {
        console.error('[DEBUG] Failed to retry document: Document not found in queue');
        toast({
          title: t('error', language) || 'Error',
          description: 'Failed to retry document processing',
          variant: 'destructive'
        });
        return;
      }

      // Update the document status in the UI
      setProcessingQueue(prev => prev.map(d =>
        d.id === id ? { ...d, status: 'queued', error: undefined } : d
      ));

      toast({
        title: 'Document Retried',
        description: 'Document has been queued for processing again.'
      });

      console.log('[DEBUG] Document retry initiated successfully');
    } catch (error) {
      console.error('[DEBUG] Error retrying document:', error);
      toast({
        title: t('error', language) || 'Error',
        description: 'Failed to retry document processing',
        variant: 'destructive'
      });
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
        {/* Supabase Error Alert */}
        <SupabaseError />
        {/* Page Header */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t('welcome', language)}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{t('dashboardTitle', language)}</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            {t('dashboardDescription', language)}
          </p>
        </div>

        {/* Upload Section */}
        <div className="relative">
          {!user && !isAuthLoading ? (
            // Login card for unauthenticated users
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogIn className="h-5 w-5" />
                  Login Required
                </CardTitle>
                <CardDescription>
                  Please login to view your documents and upload new files.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <div className="flex flex-col items-center justify-center space-y-4 max-w-md text-center">
                  <p className="text-muted-foreground">
                    You need to be logged in to access your documents and upload new files.
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/auth/login">
                      Login to Your Account
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // Upload card for authenticated users
            <>
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
                  if (!processingServiceRef.current) {
                    toast({
                      title: t('error', language),
                      description: 'Processing service not initialized',
                      variant: 'destructive',
                    });
                    return;
                  }
                  await processingServiceRef.current.pauseQueue()
                  toast({
                    title: t('processingCancelled', language),
                    description: t('processingCancelledDesc', language),
                  })
                }}
                onResume={async () => {
                  if (!processingServiceRef.current) {
                    toast({
                      title: t('error', language),
                      description: 'Processing service not initialized',
                      variant: 'destructive',
                    });
                    return;
                  }
                  await processingServiceRef.current.resumeQueue()
                  toast({
                    title: t('processingCancelled', language),
                    description: t('processingCancelledDesc', language),
                  })
                }}
                onRemove={handleRemoveFromQueue}
                onCancel={handleCancel}
                maxFileSize={settings.upload.maxFileSize}
                maxSimultaneousUploads={settings.upload.maxSimultaneousUploads}
                allowedFileTypes={settings.upload.allowedFileTypes}
                isPageDragging={isDraggingOverPage}
                onDragStateChange={setIsDraggingOverPage}
                language={language}
              />
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Stats Grid - Only show for authenticated users */}
        {user && !isAuthLoading && (
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
                {processingQueue.some(doc => doc.status === "error" || doc.status === "failed") && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {toArabicNumerals(processingQueue.filter((item) => item.status === "error" || item.status === "failed").length, language)} {t('error', language) || 'Error'}
                  </p>
                )}
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
        )}

        {/* Recent Documents - Only show for authenticated users */}
        {user && !isAuthLoading && (
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
                onCancel={handleCancel}
                onRetry={handleRetry}
                variant="grid"
                showHeader={false}
              />
            )}
          </CardContent>
          </Card>
        )}
      </div>

      <DocumentDetailsDialog
        document={selectedDocument}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        onRetry={handleRetry}
      />
    </div>
  )
}

