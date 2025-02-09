"use client"

import { useRouter } from "next/navigation"
import { FileText, MoreVertical, Download, Trash2, ImageIcon, Clock, Loader2, CheckCircle, AlertCircle, Pause } from "lucide-react"
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

interface DocumentListProps {
  documents: ProcessingStatus[]
  onShowDetails: (doc: ProcessingStatus) => void
  onDownload: (id: string) => void
  onDelete: (id: string) => void
  variant?: "table" | "grid"
  showHeader?: boolean
  isLoading?: boolean
}

export function DocumentList({ 
  documents, 
  onShowDetails, 
  onDownload, 
  onDelete, 
  variant = "table",
  showHeader = true,
  isLoading = false
}: DocumentListProps) {
  const router = useRouter()

  const canViewDocument = (doc: ProcessingStatus) => {
    if (doc.status === "completed") return true
    // Only allow viewing cancelled files if they have some processed pages
    if (doc.status === "cancelled") {
      return (doc.currentPage || 0) > 0 || (doc.totalPages || 0) > 0
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
        "bg-red-50 text-red-700 dark:bg-red-500/20": doc.status === "error",
        "bg-gray-50 text-gray-700 dark:bg-gray-500/20": doc.status === "cancelled",
        "bg-purple-50 text-purple-700 dark:bg-purple-500/20": doc.rateLimitInfo?.isRateLimited
      }
    )
  }

  const getStatusIcon = (doc: ProcessingStatus) => {
    if (doc.rateLimitInfo?.isRateLimited) {
      return <Clock className="h-3 w-3 animate-pulse" />
    }
    switch (doc.status) {
      case "completed":
        return <CheckCircle className="h-3 w-3" />
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin" />
      case "queued":
        return <Pause className="h-3 w-3" />
      case "error":
        return <AlertCircle className="h-3 w-3" />
      case "cancelled":
        return <AlertCircle className="h-3 w-3" />
      default:
        return null
    }
  }

  const getStatusText = (doc: ProcessingStatus) => {
    if (doc.rateLimitInfo?.isRateLimited) {
      const remainingTime = Math.max(0, Math.ceil(
        (doc.rateLimitInfo.retryAfter * 1000 - (Date.now() - doc.rateLimitInfo.rateLimitStart)) / 1000
      ));
      return `Resuming in ${remainingTime}s`;
    }
    if (doc.status === "processing") {
      return `Processing ${doc.currentPage}/${doc.totalPages}`
    }
    if (doc.status === "cancelled") {
      return (doc.currentPage || 0) > 0 
        ? `Cancelled (${doc.currentPage} pages processed)`
        : "Cancelled"
    }
    return doc.status.charAt(0).toUpperCase() + doc.status.slice(1)
  }

  const getProgressIndicator = (doc: ProcessingStatus) => {
    if (doc.status === "processing" || doc.rateLimitInfo?.isRateLimited) {
      return (
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
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

  if (variant === "grid") {
    return (
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
                <p className="text-sm font-medium truncate">
                  <span className="inline-flex items-center gap-2">
                    {doc.type?.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    {doc.filename}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(doc.size ?? 0)} • {doc.type?.startsWith('image/') ? '1' : doc.totalPages || doc.currentPage || 1} page(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={getStatusBadgeClass(doc)}>
                  {getStatusIcon(doc)}
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
                      <DropdownMenuItem onClick={() => onShowDetails(doc)}>
                        <FileText className="h-4 w-4 mr-2" />
                        File Information
                      </DropdownMenuItem>
                      {canViewDocument(doc) && (
                        doc.status === "cancelled" ? (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <DropdownMenuItem 
                                    onClick={() => onDownload(doc.id)}
                                    disabled={true}
                                    className="opacity-50 cursor-not-allowed"
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download Text
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Download is not available for cancelled files</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download Text
                          </DropdownMenuItem>
                        )
                      )}
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive" 
                        onClick={() => onDelete(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
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
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded bg-muted/60 animate-pulse flex-shrink-0" />
                    <div className="h-4 w-[200px] bg-muted/60 rounded animate-pulse" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="h-6 w-24 bg-muted/60 rounded-full animate-pulse" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-20 bg-muted/60 rounded animate-pulse" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-6 bg-muted/60 rounded animate-pulse" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-16 bg-muted/60 rounded animate-pulse" />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <div className="h-8 w-8 rounded bg-muted/60 animate-pulse" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {documents.map((doc) => (
            <TableRow 
              key={doc.id} 
              className={cn(
                "transition-colors",
                canViewDocument(doc) && "hover:bg-accent/5 cursor-pointer"
              )}
              onClick={() => {
                if (canViewDocument(doc)) {
                  router.push(`/documents/${doc.id}`)
                }
              }}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  {doc.type?.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="font-medium truncate max-w-[300px]">{doc.filename}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className={getStatusBadgeClass(doc)}>
                  {getStatusIcon(doc)}
                  {getStatusText(doc)}
                </span>
              </TableCell>
              <TableCell>
                {getProgressIndicator(doc)}
              </TableCell>
              <TableCell>{doc.startTime ? new Date(doc.startTime).toLocaleDateString() : "-"}</TableCell>
              <TableCell>{doc.type?.startsWith('image/') ? '1' : doc.totalPages || doc.currentPage || '-'}</TableCell>
              <TableCell>{formatFileSize(doc.size ?? 0)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onShowDetails(doc)}>
                      <FileText className="h-4 w-4 mr-2" />
                      File Information
                    </DropdownMenuItem>
                    {canViewDocument(doc) && (
                      doc.status === "cancelled" ? (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem 
                                  onClick={() => onDownload(doc.id)}
                                  disabled={true}
                                  className="opacity-50 cursor-not-allowed"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download Text
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Download is not available for cancelled files</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Text
                        </DropdownMenuItem>
                      )
                    )}
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive" 
                      onClick={() => onDelete(doc.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {documents.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No documents found
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
} 