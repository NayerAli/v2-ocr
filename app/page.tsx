"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Upload, Settings, CheckCircle, AlertCircle, Eye, ArrowRight } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FileUpload } from "./components/file-upload"
import { SettingsDialog } from "./components/settings-dialog"
import type { ProcessingStatus } from "@/types"
import { useSettings } from "@/store/settings"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { db } from "@/lib/indexed-db"
import { ProcessingService } from "@/lib/processing-service"
import { formatFileSize } from "@/lib/file-utils"
import { initializePDFJS } from "@/lib/pdf-init"

interface DashboardStats {
  totalProcessed: number
  avgProcessingTime: number
  successRate: number
  totalStorage: number
}

export default function DashboardPage() {
  const router = useRouter()
  const settings = useSettings()
  const { toast } = useToast()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [processingQueue, setProcessingQueue] = useState<ProcessingStatus[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    totalProcessed: 0,
    avgProcessingTime: 0,
    successRate: 0,
    totalStorage: 0,
  })

  // Initialize PDF.js
  useEffect(() => {
    initializePDFJS()
  }, [])

  // Create processing service with current settings
  const processingService = useMemo(
    () => new ProcessingService({
      ocr: settings.ocr,
      processing: settings.processing,
      upload: settings.upload
    }),
    [settings.ocr, settings.processing, settings.upload]
  )

  // Load queue and update stats
  useEffect(() => {
    const loadQueue = async () => {
      try {
        const queue = await db.getQueue()
        setProcessingQueue(queue)
        updateStats(queue)
        
        // Update storage stats
        const dbStats = await db.getDatabaseStats()
        setStats(prev => ({ ...prev, totalStorage: dbStats.dbSize }))
      } catch (error) {
        console.error("Error loading queue:", error)
      }
    }

    loadQueue()
    const interval = setInterval(loadQueue, 1000)
    return () => clearInterval(interval)
  }, [])

  const updateStats = (queue: ProcessingStatus[]) => {
    const completed = queue.filter((item) => item.status === "completed")
    const totalProcessed = completed.length

    const avgTime =
      completed.reduce((acc, item) => {
        return acc + ((item.endTime || 0) - (item.startTime || 0))
      }, 0) / (totalProcessed || 1)

    setStats(prev => ({
      ...prev,
      totalProcessed,
      avgProcessingTime: avgTime,
      successRate: queue.length ? (totalProcessed / queue.length) * 100 : 0,
    }))
  }

  const handleFilesAccepted = async (files: File[]) => {
    try {
      const ids = await processingService.addToQueue(files)
      const newItems = await Promise.all(ids.map((id) => processingService.getStatus(id)))
      setProcessingQueue((prev) => [...prev, ...newItems.filter((item): item is ProcessingStatus => !!item)])

      toast({
        title: "Files Added",
        description: `Added ${files.length} file(s) to processing queue`,
      })
    } catch (error) {
      toast({
        title: "Upload Error",
        description: error instanceof Error ? error.message : "Failed to process files",
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromQueue = async (id: string) => {
    try {
      await db.removeFromQueue(id)
      setProcessingQueue((prev) => prev.filter((item) => item.id !== id))
      toast({
        title: "File Removed",
        description: "Document has been removed from the queue",
      })
    } catch (error) {
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

  const isConfigured = settings.ocr.apiKey && (settings.ocr.provider !== "microsoft" || settings.ocr.region)

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Upload and process documents with OCR</p>
          </div>
          <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>

        {!isConfigured && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Required</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>Please configure your OCR API settings before uploading documents.</span>
              <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)}>
                Configure Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Upload Documents</CardTitle>
            <CardDescription>
              Drag and drop your documents here or click to browse.
              Supported formats: {settings.upload.allowedFileTypes.join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload
              onFilesAccepted={handleFilesAccepted}
              processingQueue={processingQueue}
              onPause={async () => {
                await processingService.pauseQueue()
                toast({
                  title: "Processing Paused",
                  description: "Document processing has been paused",
                })
              }}
              onResume={async () => {
                await processingService.resumeQueue()
                toast({
                  title: "Processing Resumed",
                  description: "Document processing has been resumed",
                })
              }}
              onRemove={handleRemoveFromQueue}
              disabled={!isConfigured}
              maxFileSize={settings.upload.maxFileSize}
              maxSimultaneousUploads={settings.upload.maxSimultaneousUploads}
              allowedFileTypes={settings.upload.allowedFileTypes}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{processingQueue.length}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalProcessed} processed • {formatFileSize(stats.totalStorage * 1024 * 1024)} used
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Upload className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {processingQueue.filter((item) => item.status === "processing").length}
              </div>
              <p className="text-xs text-muted-foreground">
                {processingQueue.filter((item) => item.status === "queued").length} queued
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Avg. {Math.round(stats.avgProcessingTime / 1000)}s per file
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing Speed</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {settings.processing.maxConcurrentJobs * settings.processing.pagesPerChunk}
              </div>
              <p className="text-xs text-muted-foreground">
                Pages per batch • {settings.processing.concurrentChunks} chunks
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Documents</CardTitle>
            <CardDescription>View and manage your processed documents</CardDescription>
          </CardHeader>
          <CardContent>
            {processingQueue.length > 0 ? (
              <div className="space-y-4">
                {processingQueue.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-lg border">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(item.size)} • {item.totalPages || 1} page(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            item.status === "completed" && "bg-green-100 text-green-700",
                            item.status === "processing" && "bg-blue-100 text-blue-700",
                            item.status === "error" && "bg-red-100 text-red-700",
                            item.status === "queued" && "bg-yellow-100 text-yellow-700",
                          )}
                        >
                          {item.status}
                        </span>
                        {item.status === "completed" && (
                          <Button variant="ghost" size="sm" onClick={() => handleViewResults(item.id)}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View results</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {processingQueue.length > 5 && (
                  <Button variant="outline" className="w-full" onClick={() => router.push('/documents')}>
                    View All Documents
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No documents processed yet. Start by uploading a document.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  )
}

