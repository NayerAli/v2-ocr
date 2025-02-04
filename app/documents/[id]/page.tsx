"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Download, Copy, ChevronLeft, ChevronRight, Check, AlertCircle, Keyboard, Search, Minus, Plus, ZoomIn, Type } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/indexed-db"
import type { ProcessingStatus, OCRResult } from "@/types"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOADING_TIMEOUT = 30000 // 30 seconds
const OPERATION_TIMEOUT = 10000 // 10 seconds
const IMAGE_RETRY_TIMEOUT = 3000 // 3 seconds
const IMAGE_LOAD_DELAY = 800 // 0.8 seconds for better UX

function KeyboardShortcuts() {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="hidden md:flex">
            <Keyboard className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="w-64">
          <div className="space-y-2 text-sm">
            <h4 className="font-semibold">Keyboard Shortcuts</h4>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span>Previous Page</span>
              <span className="font-mono">←</span>
              <span>Next Page</span>
              <span className="font-mono">→</span>
              <span>Copy Text</span>
              <span className="font-mono">Ctrl + C</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function DocumentPage({ params }: { params: { id: string } }) {
  const { toast } = useToast()
  const [docStatus, setDocStatus] = useState<ProcessingStatus | null>(null)
  const [results, setResults] = useState<OCRResult[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCopying, setIsCopying] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageLoadingTimeout, setImageLoadingTimeout] = useState<NodeJS.Timeout | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([])
  const [zoomLevel, setZoomLevel] = useState(100)
  const [textSize, setTextSize] = useState(16) // Default size in pixels

  const currentResult = results.find((r) => r.pageNumber === currentPage)

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setIsLoading(true)
        setError(null)
        setImageLoaded(false)
        setImageError(false)

        const timeoutId = setTimeout(() => {
          setError("Loading timeout. Please try refreshing the page.")
          setIsLoading(false)
          toast({
            variant: "destructive",
            title: "Loading Error",
            description: "The document is taking too long to load. Please try again.",
          })
        }, LOADING_TIMEOUT)

        const queue = await db.getQueue()
        const doc = queue.find((item) => item.id === params.id)
        if (!doc) {
          setError("Document not found in the processing queue")
          toast({
            variant: "destructive",
            title: "Document Not Found",
            description: "The requested document could not be found in the processing queue.",
          })
          return
        }
        setDocStatus(doc)

        const docResults = await db.getResults(params.id)
        if (!docResults || docResults.length === 0) {
          setError("No OCR results found for this document")
          toast({
            variant: "destructive",
            title: "No Results",
            description: "No OCR results were found for this document. The processing may have failed.",
          })
          return
        }

        setResults(docResults)
        clearTimeout(timeoutId)
      } catch (err) {
        const errorMessage = "Failed to load document. Please try again later."
        setError(errorMessage)
        console.error("Document loading error:", err)
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadDocument()
  }, [params.id, toast])

  // Reset states when component mounts or refreshes
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
    setRetryCount(0)
    setIsRetrying(false)
    if (imageLoadingTimeout) {
      clearTimeout(imageLoadingTimeout)
    }
  }, [imageLoadingTimeout])

  // Preload image when URL changes
  useEffect(() => {
    if (!currentResult?.imageUrl) return

    const img = new Image()
    img.onload = () => {
      setImageLoaded(true)
      setImageError(false)
      setIsRetrying(false)
    }
    img.onerror = () => {
      setImageError(true)
      setImageLoaded(false)
      setIsRetrying(false)
    }
    img.src = currentResult.imageUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [currentResult?.imageUrl])

  // Reset states when page changes
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
    setIsRetrying(false)
    if (imageLoadingTimeout) {
      clearTimeout(imageLoadingTimeout)
    }
  }, [currentPage, imageLoadingTimeout])

  // Handle image loading
  const handleImageRetry = (imageUrl: string | undefined) => {
    if (!imageUrl || isRetrying) return
    
    setIsRetrying(true)
    setImageError(false)
    setImageLoaded(false)
    setRetryCount(prev => prev + 1)

    // For base64 images, we can just retry loading directly
    const img = new Image()
    img.onload = () => {
      setIsRetrying(false)
      setImageLoaded(true)
      setImageError(false)
      toast({
        title: "Success",
        description: "Image loaded successfully.",
      })
    }
    img.onerror = () => {
      setIsRetrying(false)
      setImageError(true)
      setImageLoaded(false)
      toast({
        variant: "destructive",
        title: "Failed to Load",
        description: retryCount >= 2 
          ? "Multiple attempts failed. The image might be corrupted."
          : "Failed to load image. Please try again.",
      })
    }
    img.src = imageUrl
  }

  const handleCopyText = async () => {
    if (!currentResult?.text || isCopying) return
    
    try {
      setIsCopying(true)
      const copyTimeout = setTimeout(() => {
        setIsCopying(false)
        toast({
          variant: "destructive",
          title: "Copy Failed",
          description: "Failed to copy text. Please try again.",
        })
      }, OPERATION_TIMEOUT)

      await navigator.clipboard.writeText(currentResult.text)
      clearTimeout(copyTimeout)
      toast({
        title: "Text Copied",
        description: "The text has been copied to your clipboard.",
      })
      // Keep the checkmark visible briefly
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (err) {
      console.error("Copy error:", err)
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Failed to copy text to clipboard. Please try again.",
      })
    } finally {
      setIsCopying(false)
    }
  }

  const handleDownload = async () => {
    if (!results.length || !docStatus || isDownloading) return

    try {
      setIsDownloading(true)
      const downloadTimeout = setTimeout(() => {
        setIsDownloading(false)
        toast({
          variant: "destructive",
          title: "Download Failed",
          description: "Failed to download the document. Please try again.",
        })
      }, OPERATION_TIMEOUT)

      // Create a formatted text with proper separations and metadata
      const timestamp = new Date().toLocaleString()
      const documentName = docStatus.filename || "document"
      const separator = "=".repeat(80)
      
      const header = [
        separator,
        `Document: ${documentName}`,
        `Exported: ${timestamp}`,
        `Total Pages: ${results.length}`,
        separator,
        "\n"
      ].join("\n")

      const formattedText = results
        .sort((a, b) => a.pageNumber - b.pageNumber) // Ensure pages are in order
        .map((r) => [
          `${separator}`,
          `Page ${r.pageNumber} of ${results.length}`,
          `${separator}`,
          "",
          r.text,
          "\n"
        ].join("\n"))
        .join("\n")

      const fullText = header + formattedText

      const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${documentName}-extracted-text.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      clearTimeout(downloadTimeout)
      
      toast({
        title: "Download Started",
        description: `Exporting all ${results.length} pages as a single text file with page separations.`,
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (err) {
      console.error("Download error:", err)
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Failed to download the document. Please try again.",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleImageLoad = () => {
    setImageLoaded(true)
    setImageError(false)
    if (imageLoadingTimeout) {
      clearTimeout(imageLoadingTimeout)
    }
  }

  const handleImageError = () => {
    setImageError(true)
    setImageLoaded(false)
    if (imageLoadingTimeout) {
      clearTimeout(imageLoadingTimeout)
    }
    toast({
      variant: "destructive",
      title: "Image Load Error",
      description: "Failed to load image preview. You can still view the extracted text.",
    })
  }

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case "ArrowLeft":
          setCurrentPage((p) => Math.max(1, p - 1))
          break
        case "ArrowRight":
          setCurrentPage((p) => Math.min(results.length, p + 1))
          break
        case "c":
          if (e.ctrlKey && currentResult?.text) {
            handleCopyText()
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [results.length, currentResult])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    const matches = results
      .filter(result => result.text.toLowerCase().includes(query.toLowerCase()))
      .map(result => ({
        page: result.pageNumber,
        text: result.text
      }))
    setSearchResults(matches)
  }

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 25, 25))

  const renderTextSizeControl = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
        >
          <Type className="h-4 w-4 mr-2" />
          <span>{textSize}px</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Text Size</h4>
            <span className="text-sm text-muted-foreground">{textSize}px</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">A</span>
            <Slider
              value={[textSize]}
              min={12}
              max={24}
              step={1}
              onValueChange={([value]) => setTextSize(value)}
              className="flex-1"
            />
            <span className="text-lg font-medium">A</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[14, 16, 18].map((size) => (
              <Button
                key={size}
                variant={textSize === size ? "default" : "outline"}
                size="sm"
                onClick={() => setTextSize(size)}
                className="w-full"
              >
                {size}px
              </Button>
            ))}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          <Link href="/documents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto"
          >
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  const renderToolbar = () => (
    <div className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-full items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/documents" className="mr-2">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {isLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <h1 className="text-lg font-semibold truncate max-w-[300px]">
              {docStatus?.filename}
            </h1>
          )}
        </div>
      </div>
    </div>
  )

  const renderControls = () => (
    <div className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container h-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center min-w-[80px] justify-center">
              {isLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                <span className="text-sm">
                  {currentPage} / {results.length}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage >= results.length || isLoading}
              onClick={() => setCurrentPage((p) => Math.min(results.length, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 25}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[50px] text-center">
              {zoomLevel}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 200}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 max-w-4xl">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              type="text"
              placeholder="Search in document..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-9 pl-9 pr-4 w-full bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-ring"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-popover rounded-md border shadow-md z-10 max-h-[280px] overflow-auto">
                {searchResults.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentPage(result.page)
                      setSearchQuery("")
                      setSearchResults([])
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-accent hover:text-accent-foreground rounded-sm text-sm flex items-center justify-between group"
                  >
                    <span className="truncate flex-1 mr-4">
                      {result.text.substring(0, 100)}...
                    </span>
                    <span className="text-xs text-muted-foreground group-hover:text-accent-foreground whitespace-nowrap">
                      Page {result.page}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {renderTextSizeControl()}
            <KeyboardShortcuts />

            <Button 
              variant="ghost"
              size="sm"
              onClick={handleCopyText}
              disabled={isLoading || !currentResult?.text}
              className="h-9"
            >
              {isCopying ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  <span>Copy</span>
                </>
              )}
            </Button>

            <Button 
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={isLoading || !results.length}
              className="h-9"
            >
              {isDownloading ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  <span>Downloaded</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  <span>Download</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderImageError = (imageUrl: string) => {
    const maxRetries = 3
    const remainingRetries = maxRetries - retryCount

    return (
      <div className="relative w-full aspect-[3/4]">
        <div className="absolute inset-0 flex items-center justify-center bg-muted/5 rounded-lg border-2 border-dashed">
          <div className="flex flex-col items-center gap-4 p-6 max-w-[280px] text-center">
            <div className="p-3 rounded-full bg-background/50">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Failed to Load Preview</h3>
              <p className="text-sm text-muted-foreground">
                {retryCount >= maxRetries 
                  ? "Multiple attempts to load the image have failed. The file might be corrupted or temporarily unavailable."
                  : "The image preview couldn't be loaded. You can try again or continue with the extracted text."}
              </p>
              {remainingRetries > 0 && (
                <p className="text-xs text-muted-foreground">
                  {remainingRetries} {remainingRetries === 1 ? 'retry' : 'retries'} remaining
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant={retryCount >= maxRetries ? "ghost" : "outline"}
                size="sm"
                onClick={() => handleImageRetry(imageUrl)}
                disabled={isRetrying || retryCount >= maxRetries}
                className="relative min-w-[120px]"
              >
                {isRetrying ? (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-4 w-4 border-2 border-primary/50 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <span className="opacity-0">Try Again</span>
                  </>
                ) : retryCount >= maxRetries ? (
                  "Max Retries Reached"
                ) : (
                  "Try Again"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderImageContent = () => {
    if (isLoading) {
      return (
        <div className="relative w-full aspect-[3/4]">
          <Skeleton className="absolute inset-0" />
        </div>
      )
    }

    if (!currentResult?.imageUrl) {
      return (
        <div className="relative w-full aspect-[3/4] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/5">
          <p className="text-muted-foreground">No preview available</p>
        </div>
      )
    }

    const imageUrl = currentResult.imageUrl

    return (
      <div className="relative w-full aspect-[3/4]">
        {(!imageLoaded || isRetrying) && !imageError && (
          <div className="absolute inset-0">
            <Skeleton className="absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary/50 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {isRetrying ? "Retrying..." : "Loading preview..."}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <img
          key={`${imageUrl}-${retryCount}`} // Force new image instance on retry
          src={imageUrl}
          alt={`Page ${currentPage}`}
          className={cn(
            "absolute inset-0 w-full h-full object-contain rounded-lg transition-opacity duration-300",
            imageLoaded && !imageError ? "opacity-100" : "opacity-0"
          )}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading="eager"
          decoding="async"
        />

        {imageError && renderImageError(imageUrl)}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {renderToolbar()}
      {renderControls()}
      
      <div className="flex-1 overflow-hidden">
        <div className="container h-full py-6">
          <div className="grid grid-cols-2 gap-6 h-full">
            {/* Source Document View */}
            <div className="border rounded-lg bg-background overflow-hidden flex flex-col">
              <div className="p-3 border-b bg-muted/20">
                <h2 className="text-sm font-medium">Source Document</h2>
              </div>
              <div className="flex-1 relative">
                <ScrollArea className="absolute inset-0">
                  <div className="p-6">
                    <div 
                      style={{ 
                        transform: `scale(${zoomLevel / 100})`, 
                        transformOrigin: 'top center',
                        transition: 'transform 0.2s ease-out',
                        margin: '0 auto'
                      }}
                    >
                      {renderImageContent()}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Extracted Text View */}
            <div className="border rounded-lg bg-background overflow-hidden flex flex-col">
              <div className="p-3 border-b bg-muted/20">
                <h2 className="text-sm font-medium">Extracted Text</h2>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6">
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-[90%]" />
                      <Skeleton className="h-4 w-[95%]" />
                      <Skeleton className="h-4 w-[85%]" />
                      <Skeleton className="h-4 w-[92%]" />
                    </div>
                  ) : currentResult ? (
                    <div
                      dir={currentResult.language === "ar" || currentResult.language === "fa" ? "rtl" : "ltr"}
                      lang={currentResult.language}
                      style={{ fontSize: `${textSize}px` }}
                      className="max-w-none dark:prose-invert whitespace-pre-wrap"
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
      </div>

      {!isLoading && results.length > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
          <div className="bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60 shadow-lg rounded-full border px-3 py-1.5 flex items-center gap-3">
            <Progress 
              value={(currentPage / results.length) * 100} 
              className="w-48 h-1.5"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Page {currentPage} of {results.length}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

