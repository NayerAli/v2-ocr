"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Search, Filter, MoreVertical, Upload, Eye, Download, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { db } from "@/lib/indexed-db"
import type { ProcessingStatus } from "@/types"
import { formatFileSize } from "@/lib/file-utils"
import { cn } from "@/lib/utils"

export default function DocumentsPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<ProcessingStatus[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("date")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    const loadDocuments = async () => {
      const queue = await db.getQueue()
      setDocuments(queue)
    }

    loadDocuments()
    const interval = setInterval(loadDocuments, 1000)
    return () => clearInterval(interval)
  }, [])

  const filteredDocuments = documents
    .filter(
      (doc) =>
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (statusFilter === "all" || doc.status === statusFilter),
    )
    .sort((a, b) => {
      if (sortBy === "date") {
        const aTime = a.startTime || 0
        const bTime = b.startTime || 0
        return sortOrder === "desc" ? bTime - aTime : aTime - bTime
      }
      if (sortBy === "name") {
        return sortOrder === "desc" ? b.filename.localeCompare(a.filename) : a.filename.localeCompare(b.filename)
      }
      if (sortBy === "size") {
        return sortOrder === "desc" ? b.size - a.size : a.size - b.size
      }
      return 0
    })

  const handleDelete = async (id: string) => {
    await db.removeFromQueue(id)
    setDocuments((prev) => prev.filter((doc) => doc.id !== id))
  }

  const handleDownload = async (id: string) => {
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
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Documents</h1>
        <Link href="/">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload New
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="size">Size</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{doc.filename}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                      doc.status === "completed" && "bg-green-100 text-green-700",
                      doc.status === "processing" && "bg-blue-100 text-blue-700",
                      doc.status === "error" && "bg-red-100 text-red-700",
                      doc.status === "queued" && "bg-yellow-100 text-yellow-700",
                    )}
                  >
                    {doc.status}
                  </span>
                </TableCell>
                <TableCell>{doc.startTime ? new Date(doc.startTime).toLocaleDateString() : "-"}</TableCell>
                <TableCell>{doc.totalPages}</TableCell>
                <TableCell>{formatFileSize(doc.size)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}`)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {doc.status === "completed" && (
                        <DropdownMenuItem onClick={() => handleDownload(doc.id)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(doc.id)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredDocuments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-muted-foreground">No documents found</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

