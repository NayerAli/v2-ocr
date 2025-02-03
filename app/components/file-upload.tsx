"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, X, FileText, ImageIcon, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CONFIG } from "@/config/constants"
import type { ProcessingStatus } from "@/types"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  onFilesAccepted: (files: File[]) => Promise<void>
  processingQueue: ProcessingStatus[]
  onPause: () => void
  onResume: () => void
  onRemove: (id: string) => void
  disabled?: boolean
  className?: string
}

export function FileUpload({
  onFilesAccepted,
  processingQueue,
  onPause,
  onResume,
  onRemove,
  disabled = false,
  className,
}: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null)

      if (disabled) {
        setError("Please configure API settings before uploading files")
        return
      }

      if (rejectedFiles.length > 0) {
        setError(rejectedFiles[0].errors[0].message || "Invalid file type or size")
        return
      }

      if (acceptedFiles.length === 0) return

      setIsProcessing(true)
      try {
        await onFilesAccepted(acceptedFiles)
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to process files")
      } finally {
        setIsProcessing(false)
      }
    },
    [onFilesAccepted, disabled],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: CONFIG.SUPPORTED_TYPES,
    maxSize: CONFIG.MAX_FILE_SIZE,
    maxFiles: CONFIG.MAX_BATCH_SIZE,
    disabled: isProcessing || disabled,
  })

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase()
    return ext === "pdf" ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8",
          "flex flex-col items-center justify-center",
          "transition-colors cursor-pointer",
          isDragActive ? "border-primary bg-primary/10" : "border-muted",
          (isProcessing || disabled) && "opacity-50 cursor-not-allowed",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-10 w-10 mb-4 text-muted-foreground" />
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            {isDragActive
              ? "Drop the files here"
              : disabled
                ? "Configure API settings to upload files"
                : `Drag and drop files here, or click to select (up to ${CONFIG.MAX_BATCH_SIZE} files)`}
          </p>
          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, JPEG, PNG, TIFF, WebP (max {CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {processingQueue.length > 0 && (
        <ScrollArea className="h-[200px] rounded-md border">
          <div className="p-4 space-y-4">
            {processingQueue.map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate flex items-center gap-2">
                    {getFileIcon(item.filename)}
                    {item.filename}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.status === "processing" ? `${Math.round(item.progress)}%` : item.status}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(item.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {item.status === "processing" && <Progress value={item.progress} />}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

