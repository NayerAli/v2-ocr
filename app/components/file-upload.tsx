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
  isPageDragging?: boolean
  onDragStateChange?: (isDragging: boolean) => void
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
  isPageDragging = false,
  onDragStateChange,
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
    onDragEnter: () => onDragStateChange?.(true),
    onDragLeave: () => onDragStateChange?.(false),
    onDropAccepted: () => onDragStateChange?.(false),
    onDropRejected: () => onDragStateChange?.(false),
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
          "relative border-2 border-dashed rounded-lg",
          "h-[240px] flex flex-col items-center justify-center",
          "transition-all duration-300 ease-out",
          "cursor-pointer group overflow-hidden",
          isDragActive 
            ? "border-primary bg-primary/5 scale-[1.01]" 
            : isPageDragging
              ? "border-primary/40 bg-muted/5"
              : "border-muted/40 hover:border-primary/50 hover:bg-muted/5",
          (isUploading || disabled) && "opacity-50 cursor-not-allowed",
        )}
      >
        <input {...getInputProps()} />
        
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 pointer-events-none select-none">
          <div className="absolute inset-0 bg-grid-primary/[0.02] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
          <div className="absolute inset-4 grid grid-cols-3 gap-4">
            <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <FileText className={cn(
                "h-12 w-12 text-muted-foreground/10 transition-all duration-500",
                "group-hover:scale-110 group-hover:-rotate-6 group-hover:-translate-y-2",
                isDragActive && "scale-110 -rotate-6 -translate-y-2"
              )} />
            </div>
            <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">
              <ImageIcon className={cn(
                "h-12 w-12 text-muted-foreground/10 transition-all duration-500",
                "group-hover:scale-110 group-hover:rotate-3 group-hover:-translate-y-2",
                isDragActive && "scale-110 rotate-3 -translate-y-2"
              )} />
            </div>
            <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-150">
              <FileText className={cn(
                "h-12 w-12 text-muted-foreground/10 transition-all duration-500",
                "group-hover:scale-110 group-hover:rotate-6 group-hover:-translate-y-2",
                isDragActive && "scale-110 rotate-6 -translate-y-2"
              )} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex flex-col items-center gap-6 text-center z-10 px-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-primary/5 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500 opacity-0 group-hover:opacity-100" />
            <div className="relative p-4 rounded-full bg-gradient-to-b from-muted to-muted/80 group-hover:from-primary/10 group-hover:to-primary/5 transition-all duration-300">
              <Upload 
                className={cn(
                  "h-8 w-8 text-muted-foreground",
                  "transition-all duration-300",
                  isDragActive && "scale-125 text-primary",
                  "group-hover:scale-110 group-hover:text-primary"
                )} 
              />
            </div>
          </div>

          <div className="space-y-2 max-w-[320px]">
            <p className={cn(
              "text-base font-medium transition-colors duration-200",
              isDragActive ? "text-primary" : "text-foreground"
            )}>
              {isDragActive
                ? "Drop files here to start processing"
                : disabled
                  ? "Configure API settings to upload files"
                  : "Drag and drop your files here"}
            </p>
            <p className="text-sm text-muted-foreground">
              {!disabled && (
                <>
                  or <span className="text-primary font-medium underline decoration-dashed underline-offset-4 hover:decoration-solid cursor-pointer group-hover:decoration-solid">browse</span> to choose files
                </>
              )}
            </p>
            <div className="pt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground/80">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Supports: {allowedFileTypes.join(", ")}
              </span>
              <span className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Up to {maxSimultaneousUploads} files, {maxFileSize}MB each
              </span>
            </div>
          </div>
        </div>

        {/* Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="text-center space-y-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <div className="relative p-4 rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary animate-bounce" />
                </div>
              </div>
              <p className="text-sm font-medium text-primary">Uploading files...</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1">
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
                          {item.totalPages && item.totalPages > 0 ? ` • ${item.totalPages} pages` : ''}
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

