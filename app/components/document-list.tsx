"use client"

import { useRouter } from "next/navigation"
import { FileText, MoreVertical, Download, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatFileSize } from "@/lib/file-utils"
import { cn } from "@/lib/utils"
import type { ProcessingStatus } from "@/types"

interface DocumentListProps {
  documents: ProcessingStatus[]
  onShowDetails: (doc: ProcessingStatus) => void
  onDownload: (id: string) => void
  onDelete: (id: string) => void
  variant?: "table" | "grid"
  showHeader?: boolean
}

export function DocumentList({ 
  documents, 
  onShowDetails, 
  onDownload, 
  onDelete, 
  variant = "table",
  showHeader = true 
}: DocumentListProps) {
  const router = useRouter()

  if (variant === "grid") {
    return (
      <div className="space-y-4">
        {documents.map((doc) => (
          <div 
            key={doc.id} 
            className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
            onClick={() => {
              if (doc.status === "completed") {
                router.push(`/documents/${doc.id}`)
              }
            }}
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate">{doc.filename}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(doc.size ?? 0)} • {doc.totalPages || 1} page(s) • {doc.engine || "Not specified"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                    doc.status === "completed" && "bg-green-50 text-green-700 dark:bg-green-500/20",
                    doc.status === "processing" && "bg-blue-50 text-blue-700 dark:bg-blue-500/20",
                    doc.status === "error" && "bg-red-50 text-red-700 dark:bg-red-500/20",
                    doc.status === "queued" && "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/20"
                  )}
                >
                  {doc.status}
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
                      {doc.status === "completed" && (
                        <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Text
                        </DropdownMenuItem>
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
          </div>
        ))}
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
              <TableHead>Date</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {documents.map((doc) => (
            <TableRow 
              key={doc.id} 
              className="hover:bg-accent/5 cursor-pointer"
              onClick={() => {
                if (doc.status === "completed") {
                  router.push(`/documents/${doc.id}`)
                }
              }}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate max-w-[300px]">{doc.filename}</span>
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                    doc.status === "completed" && "bg-green-50 text-green-700 dark:bg-green-500/20",
                    doc.status === "processing" && "bg-blue-50 text-blue-700 dark:bg-blue-500/20",
                    doc.status === "error" && "bg-red-50 text-red-700 dark:bg-red-500/20",
                    doc.status === "queued" && "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/20"
                  )}
                >
                  {doc.status}
                </span>
              </TableCell>
              <TableCell>{doc.startTime ? new Date(doc.startTime).toLocaleDateString() : "-"}</TableCell>
              <TableCell>{doc.totalPages || "-"}</TableCell>
              <TableCell>{formatFileSize(doc.size ?? 0)}</TableCell>
              <TableCell>{doc.engine || "Not specified"}</TableCell>
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
                    {doc.status === "completed" && (
                      <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Text
                      </DropdownMenuItem>
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