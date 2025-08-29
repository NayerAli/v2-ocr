"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, MoreVertical, Download, Trash2, ImageIcon, Clock, Loader2, CheckCircle, AlertCircle, Pause, Eye } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatFileSize } from "@/lib/file-utils"
import { cn, isImageFile } from "@/lib/utils"
import type { ProcessingStatus } from "@/types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useLanguage } from "@/hooks/use-language"
import { t, type Language } from "@/lib/i18n/translations"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface DocumentListProps {
  documents: ProcessingStatus[]
  onShowDetails: (doc: ProcessingStatus) => void
  onDownload: (id: string) => void
  onDelete: (id: string) => void
  onCancel?: (id: string) => void
  onRetry?: (id: string) => void
  variant?: "table" | "grid"
  showHeader?: boolean
  isLoading?: boolean
}

function formatDate(date: number | Date, language: Language): string {
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  } as const

  const formatted = new Date(date).toLocaleString(
    language === 'ar' ? 'ar-EG' : language === 'fa' ? 'fa-IR' : undefined,
    options
  )

  return language === 'ar' || language === 'fa'
    ? formatted.replace(/[0-9]/g, d => ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'][parseInt(d)])
    : formatted
}

function isRTLText(text: string): boolean {
  const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
  return rtlRegex.test(text)
}

function FileNameDisplay({ filename }: { filename: string }) {
  const isRTL = isRTLText(filename)
  return (
    <span
      className={cn(
        "font-medium truncate",
        isRTL && "text-right"
      )}
      style={{
        direction: isRTL ? 'rtl' : 'ltr',
        unicodeBidi: 'isolate'
      }}
    >
      {filename}
    </span>
  )
}


function toArabicNumerals(num: number | string, language: Language): string {
  if (language !== 'ar' && language !== 'fa') return String(num)

  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)])
}

function TableColumnHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={cn("text-center", className)}>
      {children}
    </TableHead>
  )
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4" />
    case "queued":
      return <Clock className="h-4 w-4" />
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin" />
    case "cancelled":
      return <Pause className="h-4 w-4" />
    case "error":
    case "failed":
      return <AlertCircle className="h-4 w-4" />
    default:
      console.log(`[DEBUG] Unknown status: ${status}`);
      return <AlertCircle className="h-4 w-4" />
  }
}

export function DocumentList({
  documents,
  onShowDetails,
  onDownload,
  onDelete,
  onCancel,
  onRetry,
  variant = "table",
  isLoading = false
}: DocumentListProps) {
  const router = useRouter()
  const { language } = useLanguage()
  const { toast } = useToast()

  const [pendingAction, setPendingAction] = useState<
    { type: 'delete' | 'cancel'; id: string } | null
  >(null)

  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    if (!pendingAction) return
    setBusy(true)
    try {
      if (pendingAction.type === 'delete') {
        await Promise.resolve(onDelete(pendingAction.id))
      } else if (pendingAction.type === 'cancel' && onCancel) {
        const doc = documents.find(d => d.id === pendingAction.id)
        if (!doc || doc.status !== 'processing') {
          toast({
            title: t('error', language),
            description: t('cancelError', language),
            variant: 'destructive'
          })
          return
        }
        await Promise.resolve(onCancel(pendingAction.id))
      }
    } catch (err) {
      console.error(err)
      toast({
        title: t('error', language),
        description: pendingAction.type === 'delete'
          ? t('deleteError', language)
          : t('cancelError', language),
        variant: 'destructive'
      })
    } finally {
      setBusy(false)
      setPendingAction(null)
    }
  }

  const dialog = (
    <Dialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pendingAction?.type === 'delete'
              ? t('confirmDeleteTitle', language)
              : t('confirmCancelTitle', language)}
          </DialogTitle>
          <DialogDescription>
            {pendingAction?.type === 'delete'
              ? t('confirmDeleteDesc', language)
              : t('confirmCancelDesc', language)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>
            {t('close', language)}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pendingAction?.type === 'delete'
              ? t('delete', language)
              : t('cancel', language)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const canViewDocument = (doc: ProcessingStatus) => {
    if (doc.status === "completed") return true
    // Allow viewing cancelled files if they have some processed pages
    if (doc.status === "cancelled") {
      return (doc.currentPage || 0) > 0 || (doc.totalPages || 0) > 0
    }
    // Allow viewing error files to see the error details
    if (doc.status === "error" || doc.status === "failed") {
      return true
    }
    return false
  }

  const getStatusBadgeClass = (doc: ProcessingStatus) => {
    return cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
      {
        "bg-green-50 text-green-700 dark:bg-green-500/20": doc.status === "completed",
        "bg-blue-50 text-blue-700 dark:bg-blue-500/20": doc.status === "processing" && !doc.rateLimitInfo?.isRateLimited,
        "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/20": doc.status === "queued",
        "bg-red-50 text-red-700 dark:bg-red-500/20": doc.status === "error" || doc.status === "failed",
        "bg-gray-50 text-gray-700 dark:bg-gray-500/20": doc.status === "cancelled",
        "bg-purple-50 text-purple-700 dark:bg-purple-500/20": doc.rateLimitInfo?.isRateLimited
      }
    )
  }

  const getStatusText = (doc: ProcessingStatus) => {
    if (doc.rateLimitInfo?.isRateLimited) {
      const remainingTime = Math.max(0, Math.ceil(
        (doc.rateLimitInfo.retryAfter * 1000 - (Date.now() - doc.rateLimitInfo.rateLimitStart)) / 1000
      ))
      return `${t('resumingIn', language)} ${toArabicNumerals(remainingTime, language)}s`
    }

    if (doc.status === "processing") {
      return `${t('processing', language)} ${toArabicNumerals(doc.currentPage || 0, language)}/${toArabicNumerals(doc.totalPages || 0, language)}`
    }

    if (doc.status === "cancelled" && doc.currentPage && doc.currentPage > 0) {
      return `${t('cancelled', language)} (${toArabicNumerals(doc.currentPage, language)} ${t('processed', language)})`
    }

    return t(doc.status, language)
  }

  const getProgressIndicator = (doc: ProcessingStatus) => {
    if (doc.status === "processing" || doc.rateLimitInfo?.isRateLimited) {
      return (
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500",
              doc.rateLimitInfo?.isRateLimited ? "bg-purple-500" : "bg-blue-500"
            )}
            style={{ width: `${doc.progress}%` }}
          />
        </div>
      )
    }
    return null
  }

  if (isLoading) {
    return (
      <>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('fileName', language)}</TableHead>
                <TableHead>{t('status', language)}</TableHead>
                <TableHead>{t('date', language)}</TableHead>
                <TableHead>{t('pages', language)}</TableHead>
                <TableHead>{t('size', language)}</TableHead>
                <TableHead className="w-[100px] text-center">{t('actions', language)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <div className="h-8 w-8 rounded bg-muted animate-pulse" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {dialog}
      </>
    )
  }

  if (documents.length === 0) {
    return (
      <>
        <div className="text-center py-8">
          <p className="text-muted-foreground">{t('noDocuments', language)}</p>
        </div>
        {dialog}
      </>
    )
  }

  if (variant === "grid") {
    return (
      <>
        <div className="space-y-4">
          {documents.map((doc) => (
          <div
            key={doc.id}
            className={cn(
              "flex flex-col gap-3 p-4 rounded-lg border bg-card transition-colors",
              canViewDocument(doc) && "hover:bg-accent/5 cursor-pointer"
            )}
            onClick={() => {
              if (canViewDocument(doc)) {
                router.push(`/documents/${doc.id}`)
              }
            }}
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1 truncate">
                <p className="text-sm truncate">
                  <span className="inline-flex items-center gap-2">
                    {isImageFile(doc.fileType, doc.filename) ? (
                      <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <FileNameDisplay filename={doc.filename} />
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(doc.fileSize ?? 0, language)} • {toArabicNumerals(isImageFile(doc.fileType, doc.filename) ? 1 : doc.totalPages || 0, language)} {t('pages', language)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={getStatusBadgeClass(doc)}>
                  {getStatusIcon(doc.status)}
                  {getStatusText(doc)}
                </span>
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          onShowDetails(doc)
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {t('viewDetails', language)}
                      </DropdownMenuItem>
                      {canViewDocument(doc) && (
                        doc.status === "cancelled" ? (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onDownload(doc.id)
                                    }}
                                    disabled={true}
                                    className="opacity-50 cursor-not-allowed"
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    {t('download', language)}
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('downloadNotAvailableForCancelledFiles', language)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onDownload(doc.id)
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            {t('download', language)}
                          </DropdownMenuItem>
                        )
                      )}
                      {/* Show cancel button for processing documents */}
                      {doc.status === 'processing' && onCancel && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setPendingAction({ type: 'cancel', id: doc.id })
                          }}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          {t('cancel', language) || 'Cancel'}
                        </DropdownMenuItem>
                      )}

                      {/* Show retry button for error/failed documents */}
                      {(doc.status === 'error' || doc.status === 'failed') && onRetry && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onRetry(doc.id)
                          }}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          {t('retry', language) || 'Retry'}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setPendingAction({ type: 'delete', id: doc.id })
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('delete', language)}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            {getProgressIndicator(doc)}
          </div>
        ))}
        </div>
        {dialog}
      </>
    )
  }

  return (
    <>
      <div className="rounded-md border bg-card">
        <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableColumnHeader>{t('fileName', language)}</TableColumnHeader>
            <TableColumnHeader>{t('status', language)}</TableColumnHeader>
            <TableColumnHeader>{t('date', language)}</TableColumnHeader>
            <TableColumnHeader>{t('pages', language)}</TableColumnHeader>
            <TableColumnHeader>{t('size', language)}</TableColumnHeader>
            <TableColumnHeader className="w-[100px]">{t('actions', language)}</TableColumnHeader>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow
              key={doc.id}
              className={cn(
                canViewDocument(doc) && "hover:bg-accent/5 cursor-pointer"
              )}
              onClick={() => {
                if (canViewDocument(doc)) {
                  router.push(`/documents/${doc.id}`)
                }
              }}
            >
              <TableCell>
                <div className="flex items-center gap-2 max-w-[300px] sm:max-w-[400px] md:max-w-[500px]">
                  {isImageFile(doc.fileType, doc.filename) ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <FileNameDisplay filename={doc.filename} />
                </div>
              </TableCell>
              <TableCell>
                <span className={getStatusBadgeClass(doc)}>
                  {getStatusIcon(doc.status)}
                  {getStatusText(doc)}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm">
                  {formatDate(doc.processingStartedAt?.getTime() || Date.now(), language)}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm">
                  {toArabicNumerals(isImageFile(doc.fileType, doc.filename) ? 1 : doc.totalPages || 0, language)}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm">
                  {formatFileSize(doc.fileSize ?? 0, language)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">{t('openMenu', language)}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onShowDetails(doc);
                      }}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t('viewDetails', language)}
                      </DropdownMenuItem>
                      {canViewDocument(doc) && (
                        doc.status === "cancelled" ? (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDownload(doc.id);
                                    }}
                                    disabled={true}
                                    className="opacity-50 cursor-not-allowed"
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    {t('download', language)}
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('downloadNotAvailableForCancelledFiles', language)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onDownload(doc.id);
                          }}>
                            <Download className="h-4 w-4 mr-2" />
                            {t('download', language)}
                          </DropdownMenuItem>
                        )
                      )}
                      {/* Show cancel button for processing documents */}
                      {doc.status === 'processing' && onCancel && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPendingAction({ type: 'cancel', id: doc.id });
                          }}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          {t('cancel', language) || 'Cancel'}
                        </DropdownMenuItem>
                      )}

                      {/* Show retry button for error/failed documents */}
                      {(doc.status === 'error' || doc.status === 'failed') && onRetry && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry(doc.id);
                          }}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          {t('retry', language) || 'Retry'}
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingAction({ type: 'delete', id: doc.id });
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('delete', language)}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
      {dialog}
    </>
  )
}