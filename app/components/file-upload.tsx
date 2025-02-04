"use client"

import { useCallback, useState, useMemo } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, X, FileText, ImageIcon, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ProcessingStatus } from "@/types"
import { cn } from "@/lib/utils"
import { formatFileSize } from "@/lib/file-utils"

// Map file extensions to MIME types
const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.webp': 'image/webp'
} as const

interface FileUploadProps {
  onFilesAccepted: (files: File[]) => Promise<void>
  processingQueue: ProcessingStatus[]
  onPause: () => void
  onResume: () => void
  onRemove: (id: string) => void
  disabled?: boolean
  className?: string
  maxFileSize: number
  maxSimultaneousUploads: number
  allowedFileTypes: string[]
}

export function FileUpload({
  onFilesAccepted,
  processingQueue,
  onPause,
  onResume,
  onRemove,
  disabled = false,
  className,
  maxFileSize,
  maxSimultaneousUploads,
  allowedFileTypes,
}: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Convert allowed file types to accept object for dropzone
  const acceptConfig = useMemo(() => {
    const config: Record<string, string[]> = {}
    allowedFileTypes.forEach(type => {
      const ext = type.startsWith('.') ? type : `.${type}`
      const mimeType = MIME_TYPES[ext as keyof typeof MIME_TYPES]
      if (mimeType) {
        if (!config[mimeType]) {
          config[mimeType] = []
        }
        config[mimeType].push(ext)
      }
    })
    return config
  }, [allowedFileTypes])

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

      if (acceptedFiles.length > maxSimultaneousUploads) {
        setError(`Maximum ${maxSimultaneousUploads} files can be uploaded at once`)
        return
      }

      setIsProcessing(true)
      try {
        await onFilesAccepted(acceptedFiles)
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to process files")
      } finally {
        setIsProcessing(false)
      }
    },
    [onFilesAccepted, disabled, maxSimultaneousUploads],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptConfig,
    maxSize: maxFileSize * 1024 * 1024,
    maxFiles: maxSimultaneousUploads,
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
          "flex flex-col items-center justify-center gap-4",
          "transition-all duration-200 ease-in-out",
          "cursor-pointer hover:border-primary/50",
          isDragActive ? "border-primary bg-primary/10 scale-[1.02]" : "border-muted",
          (isProcessing || disabled) && "opacity-50 cursor-not-allowed",
        )}
      >
        <input {...getInputProps()} />
        <Upload 
          className={cn(
            "h-10 w-10 text-muted-foreground",
            "transition-transform duration-200",
            isDragActive && "scale-110 text-primary"
          )} 
        />
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            {isDragActive
              ? "Drop the files here"
              : disabled
                ? "Configure API settings to upload files"
                : `Drag and drop files here, or click to select (up to ${maxSimultaneousUploads} files)`}
          </p>
          <p className="text-xs text-muted-foreground">
            Supported formats: {allowedFileTypes.join(", ")} (max {maxFileSize}MB)
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
                    <span className="flex flex-col">
                      <span>{item.filename}</span>
                      {item.size && (
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(item.size)}
                        </span>
                      )}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.status === "processing" ? `${Math.round(item.progress || 0)}%` : item.status}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(item.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {item.status === "processing" && <Progress value={item.progress || 0} />}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

