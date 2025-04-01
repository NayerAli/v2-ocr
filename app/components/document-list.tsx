"use client"

import { useRouter } from "next/navigation"
import { MoreVertical, Download, Trash2, Clock, Loader2, CheckCircle, AlertCircle, Pause, Eye } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatFileSize } from "@/lib/file-utils"
import { cn } from "@/lib/utils"
import type { ProcessingStatus } from "@/types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useLanguage } from "@/hooks/use-language"
import { t, type Language, type TranslationKey } from "@/lib/i18n/translations"
import { useState } from "react"
import { FileThumbnail } from "@/app/components/file-thumbnail"

interface DocumentListProps {
  documents: ProcessingStatus[]
  onShowDetails: (doc: ProcessingStatus) => void
  onDownload: (id: string) => void
  onDelete: (id: string) => void
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
      return <AlertCircle className="h-4 w-4" />
    default:
      return null
  }
}

// Map status strings to valid translation keys
const statusToTranslationKey = (status: string): TranslationKey => {
  const map: Record<string, TranslationKey> = {
    'completed': 'completed',
    'queued': 'queued',
    'processing': 'processing',
    'cancelled': 'cancelled',
    'error': 'error',
    'rate_limited': 'rateLimited',
    'pending': 'pending',
    'failed': 'failed'
  }
  return map[status] || 'error'
}

export function DocumentList({ 
  documents, 
  onShowDetails, 
  onDownload, 
  onDelete, 
  variant = "table",
  isLoading = false
}: DocumentListProps) {
  const router = useRouter()
  const { language } = useLanguage()
  const [loadingDocuments, setLoadingDocuments] = useState<Record<string, boolean>>({})

  const canViewDocument = (doc: ProcessingStatus) => {
    if (doc.status === "completed") return true
    // Only allow viewing cancelled files if they have some processed pages
    if (doc.status === "cancelled") {
      return (doc.currentPage || 0) > 0 || (doc.totalPages || 0) > 0
    }
    return false
  }

  const handleViewDocument = async (doc: ProcessingStatus) => {
    if (!canViewDocument(doc)) return;
    
    if (doc.fileUrl && !doc.file) {
      setLoadingDocuments(prev => ({ ...prev, [doc.id]: true }))
      try {
        router.push(`/documents/${doc.id}`)
      } catch (error) {
        console.error('Error navigating to document:', error)
      } finally {
        setTimeout(() => {
          setLoadingDocuments(prev => ({ ...prev, [doc.id]: false }))
        }, 2000)
      }
    } else {
      router.push(`/documents/${doc.id}`)
    }
  }

  const getStatusBadgeClass = (doc: ProcessingStatus) => {
    return cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
      {
        "bg-green-50 text-green-700 dark:bg-green-500/20": doc.status === "completed",
        "bg-blue-50 text-blue-700 dark:bg-blue-500/20": doc.status === "processing" && !doc.rateLimitInfo?.isRateLimited,
        "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/20": doc.status === "queued",
        "bg-red-50 text-red-700 dark:bg-red-500/20": doc.status === "error",
        "bg-gray-50 text-gray-700 dark:bg-gray-500/20": doc.status === "cancelled",
        "bg-purple-50 text-purple-700 dark:bg-purple-500/20": doc.rateLimitInfo?.isRateLimited
      }
    )
  }

  const getStatusText = (doc: ProcessingStatus) => {
    if (doc.rateLimitInfo?.isRateLimited) {
      const remainingTime = Math.max(0, Math.ceil(
        (doc.rateLimitInfo.retryAfter * 1000 - (Date.now() - doc.rateLimitInfo.timestamp)) / 1000
      ))
      return `${t('resumingIn', language)} ${toArabicNumerals(remainingTime, language)}s`
    }
    
    if (doc.status === "processing") {
      return `${t('processing', language)} ${toArabicNumerals(doc.currentPage || 0, language)}/${toArabicNumerals(doc.totalPages || 0, language)}`
    }
    
    if (doc.status === "cancelled" && doc.currentPage && doc.currentPage > 0) {
      return `${t('cancelled', language)} (${toArabicNumerals(doc.currentPage, language)} ${t('processed', language)})`
    }
    
    return t(statusToTranslationKey(doc.status), language)
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
    )
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground">{t('noDocuments', language)}</p>
      </div>
    )
  }

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {documents.map(doc => (
          <div 
            key={doc.id} 
            className="flex flex-col group rounded-lg border bg-card p-3 transition-all hover:shadow-md"
          >
            <div className="grow-0 mb-2">
              <div className="flex justify-between items-start">
                <div className={getStatusBadgeClass(doc)}>
                  {getStatusIcon(doc.status)}
                  <span className="whitespace-nowrap">{getStatusText(doc)}</span>
                </div>
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-70 group-hover:opacity-100">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('actions', language)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="end">
                    {canViewDocument(doc) && (
                      <DropdownMenuItem onClick={() => handleViewDocument(doc)}>
                        {loadingDocuments[doc.id] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="mr-2 h-4 w-4" />
                        )}
                        {t('viewDetails' as TranslationKey, language)}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onShowDetails(doc)}>
                      <Eye className="mr-2 h-4 w-4" />
                      {t('documentDetails' as TranslationKey, language)}
                    </DropdownMenuItem>
                    {doc.status === "completed" && (
                      <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        {t('download', language)}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onDelete(doc.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('delete', language)}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="grow-0 flex items-center justify-center mb-3">
              <FileThumbnail document={doc} size="lg" />
            </div>

            <div className="grow flex flex-col justify-between">
              <div>
                <div className="mb-2 font-medium truncate" dir={isRTLText(doc.filename) ? 'rtl' : 'ltr'}>
                  <FileNameDisplay filename={doc.filename} />
                </div>
                <div className="text-xs text-muted-foreground flex flex-col gap-1">
                  <div>{formatDate(new Date(doc.createdAt), language)}</div>
                  {doc.fileSize && (
                    <div>{formatFileSize(doc.fileSize, language)}</div>
                  )}
                  {(doc.totalPages || doc.currentPage) && (
                    <div>
                      {t('pages', language)}: {toArabicNumerals(doc.currentPage || doc.totalPages || 0, language)}
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-2">
                {getProgressIndicator(doc)}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">{t('fileName', language)}</TableHead>
            <TableHead>{t('status', language)}</TableHead>
            <TableHead>{t('date', language)}</TableHead>
            <TableHead>{t('pages', language)}</TableHead>
            <TableHead>{t('size', language)}</TableHead>
            <TableHead className="w-[100px] text-center">{t('actions', language)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map(doc => (
            <TableRow key={doc.id} className="group">
              <TableCell>
                <div className="flex items-center gap-3">
                  <FileThumbnail document={doc} size="sm" />
                  <FileNameDisplay filename={doc.filename} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <div className={getStatusBadgeClass(doc)}>
                    {getStatusIcon(doc.status)}
                    <span>{getStatusText(doc)}</span>
                  </div>
                  {getProgressIndicator(doc)}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground text-sm">
                  {formatDate(new Date(doc.createdAt), language)}
                </span>
              </TableCell>
              <TableCell>
                {doc.totalPages ? (
                  <span className="text-muted-foreground text-sm">
                    {toArabicNumerals(doc.totalPages, language)}
                  </span>
                ) : doc.currentPage ? (
                  <span className="text-muted-foreground text-sm">
                    {toArabicNumerals(doc.currentPage, language)}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                {doc.fileSize ? (
                  <span className="text-muted-foreground text-sm">{formatFileSize(doc.fileSize, language)}</span>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-center">
                  <DropdownMenu>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-70 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('actions', language)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenuContent align="end">
                      {canViewDocument(doc) && (
                        <DropdownMenuItem onClick={() => handleViewDocument(doc)}>
                          {loadingDocuments[doc.id] ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="mr-2 h-4 w-4" />
                          )}
                          {t('viewDetails' as TranslationKey, language)}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onShowDetails(doc)}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t('documentDetails' as TranslationKey, language)}
                      </DropdownMenuItem>
                      {doc.status === "completed" && (
                        <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                          <Download className="mr-2 h-4 w-4" />
                          {t('download', language)}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onDelete(doc.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
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
  )
} 