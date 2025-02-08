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
  onCancel: (id: string) => void
  disabled?: boolean
  className?: string
  maxFileSize: number
  maxSimultaneousUploads: number
  allowedFileTypes: string[]
}

function getStatusDisplay(status: string, currentPage?: number, totalPages?: number) {
  switch (status) {
    case "processing":
      return totalPages 
        ? `Processing page ${currentPage} of ${totalPages}`
        : "Processing..."
    case "completed":
      return "Completed"
    case "queued":
      return "Queued"
    case "cancelled":
      return "Cancelled"
    case "error":
      return "Error"
    default:
      return status
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "processing":
      return "text-blue-500"
    case "completed":
      return "text-green-500"
    case "error":
      return "text-red-500"
    case "cancelled":
      return "text-gray-500"
    case "queued":
      return "text-yellow-500"
    default:
      return "text-muted-foreground"
  }
}

export function FileUpload({
  onFilesAccepted,
  processingQueue,
  onPause,
  onResume,
  onRemove,
  onCancel,
  disabled = false,
  className,
  maxFileSize,
  maxSimultaneousUploads,
  allowedFileTypes,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
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

      setIsUploading(true)
      
      // Initialize progress for each file
      const initialProgress: Record<string, number> = {}
      acceptedFiles.forEach(file => {
        initialProgress[file.name] = 0
      })
      setUploadProgress(initialProgress)

      try {
        // Simulate upload progress
        const uploadPromises = acceptedFiles.map(async (file) => {
          // Simulate chunked upload
          const chunks = 10
          for (let i = 1; i <= chunks; i++) {
            if (!isUploading) break // Allow cancellation
            await new Promise(resolve => setTimeout(resolve, 100)) // Simulate network delay
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: (i / chunks) * 100
            }))
          }
          return file
        })

        const uploadedFiles = await Promise.all(uploadPromises)
        await onFilesAccepted(uploadedFiles)
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to upload files")
      } finally {
        setIsUploading(false)
        setUploadProgress({})
      }
    },
    [onFilesAccepted, disabled, maxSimultaneousUploads],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptConfig,
    maxSize: maxFileSize * 1024 * 1024,
    maxFiles: maxSimultaneousUploads,
    disabled: isUploading || disabled,
  })

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase()
    return ext === "pdf" ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />
  }

  const handleAction = (item: ProcessingStatus) => {
    if (item.status === "processing") {
      return (
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon"
            className="h-6 w-6 text-red-500 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation()
              onCancel(item.id)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )
    }
    
    if (item.status !== "cancelled") {
      return (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={(e) => {
            e.stopPropagation()
            onRemove(item.id)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )
    }

    return null
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
          (isUploading || disabled) && "opacity-50 cursor-not-allowed",
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

      {(isUploading || processingQueue.length > 0) && (
        <ScrollArea className="h-[200px] rounded-md border">
          <div className="p-4 space-y-4">
            {/* Upload Progress */}
            {isUploading && Object.entries(uploadProgress).map(([filename, progress]) => (
              <div key={filename} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate flex items-center gap-2">
                    {getFileIcon(filename)}
                    <span className="flex flex-col">
                      <span>{filename}</span>
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-500">
                      Uploading {Math.round(progress)}%
                    </span>
                  </div>
                </div>
                <div className="relative w-full">
                  <Progress value={progress} className="h-2" />
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent animate-progress" 
                    style={{ 
                      clipPath: `inset(0 ${100 - progress}% 0 0)`,
                      transition: 'clip-path 0.3s ease-in-out'
                    }} 
                  />
                </div>
              </div>
            ))}
            
            {/* Queue Items */}
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
                          {item.totalPages ? ` • ${item.totalPages} pages` : ''}
                        </span>
                      )}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs", getStatusColor(item.status))}>
                      {getStatusDisplay(item.status, item.currentPage, item.totalPages)}
                    </span>
                    {handleAction(item)}
                  </div>
                </div>
                {item.status === "processing" && item.totalPages && (
                  <div className="relative w-full">
                    <Progress 
                      value={(item.currentPage || 0) / item.totalPages * 100} 
                      className="h-2"
                    />
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>Page {item.currentPage} of {item.totalPages}</span>
                      <span>{Math.round((item.currentPage || 0) / item.totalPages * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

