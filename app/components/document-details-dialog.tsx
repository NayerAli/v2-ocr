"use client"

import { FileText, Calendar, HardDrive, Clock, AlertCircle, CheckCircle2, XCircle, Loader2, Settings } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { formatFileSize, formatDuration } from "@/lib/file-utils"
import { useSettings } from "@/store/settings"
import type { ProcessingStatus } from "@/types"

interface DocumentDetailsDialogProps {
  document: ProcessingStatus | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentDetailsDialog({ document, open, onOpenChange }: DocumentDetailsDialogProps) {
  const settings = useSettings()
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
            Document Information
          </DialogTitle>
          <DialogDescription>
            Technical details and processing information about your document
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">File Information</TabsTrigger>
            <TabsTrigger value="processing">Processing Details</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Document Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Filename</span>
                  <span className="font-medium">{document.filename}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">File Type</span>
                  <span className="font-medium">{document.metadata?.type || document.filename.split('.').pop()?.toUpperCase() || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Size</span>
                  <span className="font-medium">{formatFileSize(document.size ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Pages</span>
                  <span className="font-medium">{document.totalPages || "Unknown"}</span>
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
                <CardTitle className="text-lg">Processing Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className={`font-medium flex items-center gap-2 ${getStatusColor(document.status)}`}>
                    {getStatusIcon(document.status)}
                    {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <span className="font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    {getProviderName()}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Language</span>
                  <span className="font-medium">{settings.ocr.language.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Started At</span>
                  <span className="font-medium">
                    {document.startTime ? new Date(document.startTime).toLocaleString() : "Not started"}
                  </span>
                </div>
                {document.completionTime && (
                  <>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">Completed At</span>
                      <span className="font-medium">{new Date(document.completionTime).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-muted-foreground">Total Duration</span>
                      <span className="font-medium">
                        {formatDuration(document.completionTime - (document.startTime || 0))}
                      </span>
                    </div>
                  </>
                )}
                {document.error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Processing Error</AlertTitle>
                    <AlertDescription>{document.error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Processing Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">Concurrent Jobs</span>
                    <span className="font-medium">{settings.processing.maxConcurrentJobs}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">Pages per Chunk</span>
                    <span className="font-medium">{settings.processing.pagesPerChunk}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">Concurrent Chunks</span>
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
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 