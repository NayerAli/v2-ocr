"use client"

import { useCallback, useState, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, X, FileText, ImageIcon, Clock, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatFileSize } from "@/lib/file-utils"
import { cn } from "@/lib/utils"
import type { ProcessingStatus } from "@/types"
import { Language, t } from "@/lib/i18n/translations"

interface FileUploadProps {
  onFilesAccepted: (files: File[]) => void
  processingQueue: ProcessingStatus[]
  onPause: () => void
  onResume: () => void
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  disabled?: boolean
  maxFileSize: number
  maxSimultaneousUploads: number
  allowedFileTypes: string[]
  isPageDragging?: boolean
  onDragStateChange?: (isDragging: boolean) => void
  language: Language
}

export function FileUpload({
  onFilesAccepted,
  processingQueue,
  onPause,
  onResume,
  onRemove,
  onCancel,
  disabled,
  maxFileSize,
  maxSimultaneousUploads,
  allowedFileTypes,
  isPageDragging,
  onDragStateChange,
  language
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [countdowns, setCountdowns] = useState<Record<string, number>>({})

  // Update countdowns every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns(prev => {
        const now = Date.now()
        const updated: Record<string, number> = {}
        let hasChanges = false

        processingQueue.forEach(item => {
          if (item.rateLimitInfo?.isRateLimited) {
            const remaining = Math.max(0, Math.ceil(
              (item.rateLimitInfo.retryAfter * 1000 - (now - item.rateLimitInfo.rateLimitStart)) / 1000
            ))
            if (remaining !== prev[item.id]) {
              hasChanges = true
              updated[item.id] = remaining
            }
          }
        })

        return hasChanges ? { ...prev, ...updated } : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [processingQueue])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setIsUploading(true)
    Promise.resolve(onFilesAccepted(acceptedFiles))
      .finally(() => setIsUploading(false))
  }, [onFilesAccepted])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    maxSize: maxFileSize * 1024 * 1024,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    onDragEnter: () => onDragStateChange?.(true),
    onDragLeave: () => onDragStateChange?.(false),
    onDropAccepted: () => onDragStateChange?.(false),
    onDropRejected: () => onDragStateChange?.(false),
  })

  const activeFiles = processingQueue.filter(
    (item) => item.status === "processing" || item.status === "queued"
  )

  const isProcessing = activeFiles.some((item) => item.status === "processing")
  const isRateLimited = activeFiles.some((item) => item.rateLimitInfo?.isRateLimited)

  const getQueueItemStatus = (item: ProcessingStatus) => {
    if (item.rateLimitInfo?.isRateLimited) {
      const countdown = countdowns[item.id] || Math.max(0, Math.ceil(
        (item.rateLimitInfo.retryAfter * 1000 - (Date.now() - item.rateLimitInfo.rateLimitStart)) / 1000
      ))

      return (
        <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
          <Clock className="h-3.5 w-3.5 animate-pulse" />
          <div className="flex items-center gap-2">
            <span className="text-xs">Resuming in</span>
            <span className="font-mono text-xs tabular-nums">
              {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )
    }

    if (item.status === "processing") {
      return (
        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Processing page {item.currentPage} of {item.totalPages}</span>
        </div>
      )
    }

    if (item.status === "queued") {
      return (
        <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs">Queued</span>
        </div>
      )
    }

    return null
  }

  const getProgressInfo = (item: ProcessingStatus) => {
    if (!item.totalPages) return null

    const processed = item.currentPage || 0
    const percent = Math.round((processed / item.totalPages) * 100)

    return (
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
        <span>{processed} of {item.totalPages} pages</span>
        <span className="font-mono">{percent}%</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
                ? t('dropFiles', language)
                : disabled
                  ? t('configureToUpload', language)
                  : t('dragAndDrop', language)}
            </p>
            <p className="text-sm text-muted-foreground">
              {!disabled && (
                <>
                  {t('orBrowse', language)} <span className="text-primary font-medium underline decoration-dashed underline-offset-4 hover:decoration-solid cursor-pointer group-hover:decoration-solid">{t('browseFiles', language)}</span>
                </>
              )}
            </p>
            <div className="pt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground/80">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {t('supports', language)}: {allowedFileTypes.join(", ")}
              </span>
              <span className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                {t('upTo', language)} {maxSimultaneousUploads} {t('filesEach', language)}, {maxFileSize}{t('mbEach', language)}
              </span>
            </div>
          </div>
        </div>

        {/* Upload Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="text-center space-y-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <div className="relative p-4 rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary animate-bounce" />
                </div>
              </div>
              <p className="text-sm font-medium text-primary">{t('uploadingFiles', language)}</p>
            </div>
          </div>
        )}
      </div>

      {activeFiles.length > 0 ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {t('processingQueue', language)}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={isProcessing ? onPause : onResume}
              disabled={isRateLimited}
              className="h-7 px-2 text-xs gap-1.5"
            >
              {isProcessing ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t('pause', language)}
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  {t('resume', language)}
                </>
              )}
            </Button>
          </div>

          {isRateLimited && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs">
              <Clock className="h-3.5 w-3.5 animate-pulse" />
              <span>{t('rateLimitMessage', language)}</span>
            </div>
          )}

          <div className="space-y-2">
            {activeFiles.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-1.5 p-2 rounded-md border bg-background/40",
                  item.rateLimitInfo?.isRateLimited && "border-purple-200 dark:border-purple-800"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.fileType?.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(item.fileSize ?? 0, language)}
                      </p>
                    </div>
                  </div>
                  {item.status === "processing" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 text-xs gap-1.5"
                      onClick={() => onCancel(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('cancel', language)}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onRemove(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  )}
                </div>

                <div className="space-y-1">
                  {getQueueItemStatus(item)}
                  <Progress
                    value={item.progress}
                    className={cn(
                      "h-1.5",
                      item.rateLimitInfo?.isRateLimited && "bg-purple-100 dark:bg-purple-900",
                      "[&>div]:transition-all [&>div]:duration-500",
                      item.rateLimitInfo?.isRateLimited ? "[&>div]:bg-purple-500" : "[&>div]:bg-blue-500"
                    )}
                  />
                  {getProgressInfo(item)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card/50 p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-primary/5 mb-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium">{t('noActiveUploads', language)}</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
              {t('dropFilesAbove', language)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

