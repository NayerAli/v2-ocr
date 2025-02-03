"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Download, Copy, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { db } from "@/lib/indexed-db"
import type { ProcessingStatus, OCRResult } from "@/types"

export default function DocumentPage({ params }: { params: { id: string } }) {
  const [document, setDocument] = useState<ProcessingStatus | null>(null)
  const [results, setResults] = useState<OCRResult[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const queue = await db.getQueue()
        const doc = queue.find((item) => item.id === params.id)
        if (!doc) {
          setError("Document not found")
          return
        }
        setDocument(doc)

        const docResults = await db.getResults(params.id)
        if (!docResults || docResults.length === 0) {
          setError("No results found for this document")
          return
        }
        setResults(docResults)
      } catch (err) {
        setError("Failed to load document")
        console.error(err)
      }
    }

    loadDocument()
  }, [params.id])

  const currentResult = results.find((r) => r.pageNumber === currentPage)

  const handleCopyText = async () => {
    if (currentResult?.text) {
      await navigator.clipboard.writeText(currentResult.text)
    }
  }

  const handleDownload = () => {
    if (!results.length) return

    const text = results.map((r) => `Page ${r.pageNumber}:\n${r.text}`).join("\n\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${document?.filename || "document"}-results.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!document || !results.length) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Loading...</h2>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/documents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">{document.filename}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleCopyText}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
        {/* Source Document View */}
        <div className="border rounded-lg">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Source Document</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {results.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage >= results.length}
                onClick={() => setCurrentPage((p) => Math.min(results.length, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[calc(100%-4rem)]">
            <div className="p-4">
              {currentResult?.imageUrl ? (
                <img
                  src={currentResult.imageUrl || "/placeholder.svg"}
                  alt={`Page ${currentPage}`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No preview available</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Extracted Text View */}
        <div className="border rounded-lg">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Extracted Text</h2>
          </div>
          <ScrollArea className="h-[calc(100%-4rem)]">
            <div className="p-4">
              {currentResult ? (
                <div
                  dir={currentResult.language === "ar" || currentResult.language === "fa" ? "rtl" : "ltr"}
                  lang={currentResult.language}
                  className="prose prose-sm max-w-none dark:prose-invert"
                >
                  <pre className="whitespace-pre-wrap font-sans">{currentResult.text}</pre>
                </div>
              ) : (
                <p className="text-muted-foreground">No text extracted for this page</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

