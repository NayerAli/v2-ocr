"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { Search, Filter, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DocumentDetailsDialog } from "../components/document-details-dialog"
import { DocumentList } from "../components/document-list"
import { db } from "@/lib/indexed-db"
import type { ProcessingStatus } from "@/types"
import { cn } from "@/lib/utils"
import { useSettingsInit } from "@/hooks/use-settings-init"

export default function DocumentsPage() {
  const { isInitialized } = useSettingsInit()
  const [documents, setDocuments] = useState<ProcessingStatus[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("date")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [selectedDocument, setSelectedDocument] = useState<ProcessingStatus | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  const handleShowDetails = useCallback((doc: ProcessingStatus) => {
    setSelectedDocument(doc)
    setIsDetailsOpen(true)
  }, [])

  useEffect(() => {
    let isSubscribed = true
    const loadDocuments = async (isInitialLoad = false) => {
      if (!isInitialized) return

      try {
        // Only show loading state on initial load
        if (isInitialLoad) {
          setIsLoadingData(true)
        }
        
        const queue = await db.getQueue()
        if (isSubscribed) {
          setDocuments(queue)
        }
      } catch (error) {
        console.error("Error loading documents:", error)
      } finally {
        if (isSubscribed && isInitialLoad) {
          setIsLoadingData(false)
        }
      }
    }

    // Initial load with loading state
    loadDocuments(true)
    
    // Setup polling without loading state
    const interval = setInterval(() => loadDocuments(false), 3000)
    
    return () => {
      isSubscribed = false
      clearInterval(interval)
    }
  }, [isInitialized])

  const getSortedDocuments = useCallback((docs: ProcessingStatus[], sort: string, order: "asc" | "desc") => {
    return [...docs].sort((a, b) => {
      if (sort === "date") {
        const aTime = a.startTime || 0
        const bTime = b.startTime || 0
        return order === "desc" ? bTime - aTime : aTime - bTime
      }
      if (sort === "name") {
        return order === "desc" ? b.filename.localeCompare(a.filename) : a.filename.localeCompare(b.filename)
      }
      if (sort === "size") {
        return order === "desc" 
          ? (b.size ?? 0) - (a.size ?? 0) 
          : (a.size ?? 0) - (b.size ?? 0)
      }
      return 0
    })
  }, [])

  const filteredDocuments = useMemo(() => {
    const filtered = documents.filter(
      (doc) =>
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (statusFilter === "all" || doc.status === statusFilter),
    )
    return getSortedDocuments(filtered, sortBy, sortOrder)
  }, [documents, searchQuery, statusFilter, sortBy, sortOrder, getSortedDocuments])

  const debouncedSearch = useCallback((value: string) => {
    setSearchQuery(value)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await db.removeFromQueue(id)
    setDocuments((prev) => prev.filter((doc) => doc.id !== id))
  }, [])

  const handleDownload = useCallback(async (id: string) => {
    const results = await db.getResults(id)
    if (!results) return

    const text = results.map((r) => r.text).join("\n\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `results-${id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Documents Library</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Processed Documents</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            View and manage your processed documents. Filter, sort, and download extracted text.
          </p>
        </div>
        <div className="flex items-start pt-4">
          <Link href="/">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload New
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents by name..."
            defaultValue={searchQuery}
            onChange={(e) => debouncedSearch(e.target.value)}
            className="pl-9 w-full"
            disabled={isLoadingData}
          />
        </div>
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isLoadingData}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy} disabled={isLoadingData}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort by Date</SelectItem>
              <SelectItem value="name">Sort by Name</SelectItem>
              <SelectItem value="size">Sort by Size</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            className="h-10 w-10"
            disabled={isLoadingData}
          >
            <Filter className={cn("h-4 w-4 transition-transform", sortOrder === "desc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      <DocumentList
        documents={filteredDocuments}
        onShowDetails={handleShowDetails}
        onDownload={handleDownload}
        onDelete={handleDelete}
        isLoading={isLoadingData}
      />

      <DocumentDetailsDialog
        document={selectedDocument}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />
    </div>
  )
}

