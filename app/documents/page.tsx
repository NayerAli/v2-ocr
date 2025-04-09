"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Filter, Upload, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DocumentDetailsDialog } from "../components/document-details-dialog"
import { DocumentList } from "../components/document-list"
import { SupabaseError } from "../components/supabase-error"
import { db } from "@/lib/database"
import type { ProcessingStatus } from "@/types"
import { cn } from "@/lib/utils"
import { useSettingsInit } from "@/hooks/use-settings-init"
import { useLanguage } from "@/hooks/use-language"
import { t } from "@/lib/i18n/translations"
import { useAuth } from "@/components/auth/auth-provider"
import { AuthCheck } from "@/components/auth/auth-check"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function DocumentsPage() {
  const { isInitialized } = useSettingsInit()
  const { language } = useLanguage()
  const { user } = useAuth()
  const router = useRouter()
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

  // Load documents when initialized
  useEffect(() => {
    if (!isInitialized) return

    console.log('Documents page: Initialized, loading documents for user')
    setIsLoadingData(true)

    db.getQueue().then(queue => {
      console.log('Documents page: Documents loaded:', queue.length)
      setDocuments(queue)
      setIsLoadingData(false)
    }).catch(error => {
      console.error('Error loading documents:', error)
      setIsLoadingData(false)
    })
  }, [isInitialized])

  useEffect(() => {
    let isSubscribed = true

    // Setup polling for document updates
    const loadDocuments = async () => {
      if (!isInitialized) return

      try {
        const queue = await db.getQueue()
        if (isSubscribed) {
          setDocuments(queue)
        }
      } catch (error) {
        console.error("Error loading documents:", error)
      }
    }

    // Setup polling without loading state
    const interval = setInterval(() => loadDocuments(), 3000)

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
    try {
      console.log('[DEBUG] Deleting document:', id);

      // Get the document status
      const doc = documents.find(d => d.id === id);

      // If the document is processing, cancel it first
      if (doc && doc.status === 'processing') {
        console.log('[DEBUG] Canceling processing before delete');
        const cancelResponse = await fetch(`/api/queue/${id}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!cancelResponse.ok) {
          console.error('[DEBUG] Failed to cancel processing:', await cancelResponse.text());
        }
      }

      // Delete the document
      const deleteResponse = await fetch(`/api/queue/${id}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!deleteResponse.ok) {
        console.error('[DEBUG] Failed to delete document:', await deleteResponse.text());
        return;
      }

      // Update the UI
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      console.log('[DEBUG] Document deleted successfully');
    } catch (error) {
      console.error('[DEBUG] Error deleting document:', error);
    }
  }, [documents])

  const handleCancel = useCallback(async (id: string) => {
    try {
      console.log('[DEBUG] Canceling processing for document:', id);

      const cancelResponse = await fetch(`/api/queue/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!cancelResponse.ok) {
        console.error('[DEBUG] Failed to cancel processing:', await cancelResponse.text());
        return;
      }

      // Update the document status in the UI
      setDocuments(prev => prev.map(doc =>
        doc.id === id ? { ...doc, status: 'cancelled' } : doc
      ));

      console.log('[DEBUG] Processing canceled successfully');
    } catch (error) {
      console.error('[DEBUG] Error canceling processing:', error);
    }
  }, []);

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
    <AuthCheck>
    <div className="space-y-8">
      <SupabaseError />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t('documentsLibrary', language)}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{t('processedDocuments', language)}</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            {t('documentsDescription', language)}
          </p>
        </div>
        <div className="flex items-start pt-4">
          <Link href="/">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              {t('uploadNew', language)}
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchDocuments', language)}
            defaultValue={searchQuery}
            onChange={(e) => debouncedSearch(e.target.value)}
            className="pl-9 w-full"
            disabled={isLoadingData}
          />
        </div>
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isLoadingData}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('filterByStatus', language)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatus', language)}</SelectItem>
              <SelectItem value="completed">{t('completed', language)}</SelectItem>
              <SelectItem value="processing">{t('processing', language)}</SelectItem>
              <SelectItem value="queued">{t('queued', language)}</SelectItem>
              <SelectItem value="cancelled">{t('cancelled', language)}</SelectItem>
              <SelectItem value="error">{t('error', language)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy} disabled={isLoadingData}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('sortBy', language)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">{t('sortByDate', language)}</SelectItem>
              <SelectItem value="name">{t('sortByName', language)}</SelectItem>
              <SelectItem value="size">{t('sortBySize', language)}</SelectItem>
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
        onCancel={handleCancel}
        isLoading={isLoadingData}
      />

      <DocumentDetailsDialog
        document={selectedDocument}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />
    </div>
    </AuthCheck>
  )
}

