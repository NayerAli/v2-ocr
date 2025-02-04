"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Upload, Settings, CheckCircle, AlertCircle, Eye } from "lucide-react"
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
import { CONFIG } from "@/config/constants"
import { initializePDFJS } from "@/lib/pdf-init"

export default function DashboardPage() {
  const settings = useSettings()
  const { toast } = useToast()
  const router = useRouter()
  const [processingQueue, setProcessingQueue] = useState<ProcessingStatus[]>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [stats, setStats] = useState({
    totalProcessed: 0,
    avgProcessingTime: 0,
    successRate: 0,
  })

  const processingService = React.useMemo(() => new ProcessingService(settings.ocr), [settings.ocr])

  // Initialize PDF.js and load queue
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        await initializePDFJS()
      } catch (error) {
        console.error("Failed to initialize PDF.js:", error)
        toast({
          title: "PDF Support Error",
          description: "Failed to initialize PDF support. PDF processing may not work correctly.",
          variant: "destructive",
        })
      }

      const savedQueue = await db.getQueue()
      if (!mounted) return

      setProcessingQueue(savedQueue)
      updateStats(savedQueue)
    }

    init()
    const interval = setInterval(() => {
      if (mounted) {
        db.getQueue().then((queue) => {
          setProcessingQueue(queue)
          updateStats(queue)
        })
      }
    }, CONFIG.POLLING_INTERVAL)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [toast])

  const updateStats = (queue: ProcessingStatus[]) => {
    const completed = queue.filter((item) => item.status === "completed")
    const totalProcessed = completed.length

    const avgTime =
      completed.reduce((acc, item) => {
        return acc + ((item.endTime || 0) - (item.startTime || 0))
      }, 0) / (totalProcessed || 1)

    setStats({
      totalProcessed,
      avgProcessingTime: avgTime,
      successRate: queue.length ? (totalProcessed / queue.length) * 100 : 0,
    })
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

  const handleViewResults = async (id: string) => {
    router.push(`/documents/${id}`)
  }

  const handleRemoveFromQueue = async (id: string) => {
    await db.removeFromQueue(id)
    setProcessingQueue((prev) => prev.filter((item) => item.id !== id))
    toast({
      title: "Item Removed",
      description: "Document removed from processing queue",
    })
  }

  return (
    <>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/documents")}>
              <FileText className="mr-2 h-4 w-4" />
              View All Documents
            </Button>
            <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              API Settings
            </Button>
          </div>
        </div>

        {!settings.ocr.apiKey && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>API Not Configured</AlertTitle>
            <AlertDescription>
              You can upload documents, but they will remain in queue until API credentials are configured.
              <Button variant="link" className="p-0 h-auto font-normal ml-2" onClick={() => setIsSettingsOpen(true)}>
                Configure API
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-dashed">
          <CardContent className="pt-6">
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
              <p className="text-xs text-muted-foreground">{stats.totalProcessed} processed</p>
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
              <CardTitle className="text-sm font-medium">API Status</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-bold",
                  settings.ocr.apiKey && "text-green-500",
                  !settings.ocr.apiKey && "text-red-500",
                )}
              >
                {settings.ocr.apiKey ? "Active" : "Inactive"}
              </div>
              <p className="text-xs text-muted-foreground">{settings.ocr.provider} service</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {processingQueue.length > 0 ? (
                <div className="space-y-4">
                  {processingQueue.slice(0, CONFIG.MAX_QUEUE_DISPLAY).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(item.size)} • {item.totalPages} page(s)
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
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No documents processed yet. Start by uploading a document.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  )
}

