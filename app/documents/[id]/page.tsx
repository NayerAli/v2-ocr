"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ArrowLeft, Download, Copy, ChevronLeft, ChevronRight, Check, AlertCircle, Keyboard, Search, Minus, Plus, Type, ScanLine, Upload, FileText, ImageIcon } from "lucide-react"
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
import { useRouter } from "next/navigation"

const LOADING_TIMEOUT = 30000 // 30 seconds
const OPERATION_TIMEOUT = 10000 // 10 seconds

// Add LRU Cache for images
class ImageCache {
  private cache: Map<string, HTMLImageElement>
  private maxSize: number

  constructor(maxSize = 10) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  get(key: string): HTMLImageElement | undefined {
    const item = this.cache.get(key)
    if (item) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }

  set(key: string, image: HTMLImageElement): void {
    if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, image)
  }

  preload(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (this.has(url)) {
        resolve(this.get(url)!)
        return
      }

      const img = new Image()
      img.onload = () => {
        this.set(url, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = url
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

const imageCache = new ImageCache(15) // Cache up to 15 pages

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
  const [isDragging, setIsDragging] = useState(false)
  const [ setDragPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ setFitMode] = useState<'width' | 'height' | 'auto'>('auto')
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
  const lastMousePosition = useRef({ x: 0, y: 0 })
  const router = useRouter()
  const [pageInputValue, setPageInputValue] = useState<string>("")
  const [isEditingPage, setIsEditingPage] = useState(false)

  const currentResult = results.find((r) => r.pageNumber === currentPage)

  // Move getStatusDisplay inside the component
  const getStatusDisplay = (status: string, currentPage?: number, totalPages?: number) => {
    switch (status) {
      case "processing":
        return totalPages 
          ? `Processing page ${currentPage} of ${totalPages}`
          : "Processing..."
      case "completed":
        return "Completed"
      case "queued":
        return "Queued"
      case "cancelled":
        return "Processing Cancelled"
      case "error":
        return "Error"
      default:
        return status
    }
  }

  // Zoom-related functions
  const handleZoomChange = useCallback((newZoom: number) => {
    if (!imageContainerRef.current || !imageRef.current) return

    const container = imageContainerRef.current
    const image = imageRef.current
    
    // Reset pan position when zooming to 100% or less
    if (newZoom <= 100) {
      setPanPosition({ x: 0, y: 0 })
    } else {
      // Maintain center point when zooming
      const containerRect = container.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()

      const containerCenterX = containerRect.width / 2
      const containerCenterY = containerRect.height / 2
      const imageCenterX = (imageRect.left + imageRect.right) / 2
      const imageCenterY = (imageRect.top + imageRect.bottom) / 2

      const scaleDiff = newZoom / zoomLevel
      const newX = (containerCenterX - imageCenterX) * (scaleDiff - 1)
      const newY = (containerCenterY - imageCenterY) * (scaleDiff - 1)

      // Apply smooth transition to pan position
      requestAnimationFrame(() => {
        setPanPosition(prev => ({
          x: prev.x + newX,
          y: prev.y + newY
        }))
      })
    }

    setZoomLevel(newZoom)
  }, [zoomLevel])

  const handleZoomIn = useCallback(() => {
    handleZoomChange(Math.min(zoomLevel + 25, 200))
  }, [handleZoomChange, zoomLevel])

  const handleZoomOut = useCallback(() => {
    handleZoomChange(Math.max(zoomLevel - 25, 25))
  }, [handleZoomChange, zoomLevel])

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

        if (doc.status === "cancelled") {
          clearTimeout(timeoutId)
          setIsLoading(false)
          return
        }

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
        setResults(docResults.sort((a, b) => a.pageNumber - b.pageNumber))

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

  // Add preloading logic
  useEffect(() => {
    if (!results.length) return

    const preloadImages = async () => {
      const currentIdx = currentPage - 1
      const pagesToPreload = [
        // Current page
        currentIdx,
        // Next 2 pages
        currentIdx + 1,
        currentIdx + 2,
        // Previous page
        currentIdx - 1
      ].filter(idx => idx >= 0 && idx < results.length)

      for (const idx of pagesToPreload) {
        const result = results[idx]
        if (result?.imageUrl) {
          try {
            await imageCache.preload(result.imageUrl)
          } catch (error) {
            console.error(`Failed to preload image for page ${idx + 1}:`, error)
          }
        }
      }
    }

    preloadImages()
  }, [currentPage, results])

  // Clear cache when component unmounts or document changes
  useEffect(() => {
    return () => {
      imageCache.clear()
    }
  }, [params.id])

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

  // Update image loading logic
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
    setImageError(false)
    if (imageLoadingTimeout) {
      clearTimeout(imageLoadingTimeout)
    }
    if (imageRef.current) {
      setImageSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      })
      // Start at 100% zoom
      setZoomLevel(100)
      setPanPosition({ x: 0, y: 0 })
    }
  }, [imageLoadingTimeout])

  const handleImageError = useCallback(() => {
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
  }, [imageLoadingTimeout, toast])

  const handleSearch = useCallback((query: string) => {
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
  }, [results])

  // Move calculateFitZoom before its usage
  const calculateFitZoom = (mode: 'width' | 'height' | 'auto') => {
    if (!imageRef.current || !containerRef.current) return 100

    const container = containerRef.current
    const image = imageRef.current
    const padding = 32 // Account for padding
    const containerWidth = container.clientWidth - padding * 2
    const containerHeight = container.clientHeight - padding * 2

    const imageWidth = image.naturalWidth
    const imageHeight = image.naturalHeight

    const widthRatio = containerWidth / imageWidth
    const heightRatio = containerHeight / imageHeight

    if (mode === 'width') {
      return widthRatio * 100
    } else if (mode === 'height') {
      return heightRatio * 100
    } else {
      // Auto mode - fit either width or height depending on aspect ratio
      return Math.min(widthRatio, heightRatio) * 100
    }
  }

  // Memoize complex calculations
  const zoomPresets = useMemo(() => {
    if (!imageRef.current) return [25, 50, 75, 100, 125, 150, 200]
    
    const fitZoom = calculateFitZoom('auto')
    const roundedFitZoom = Math.round(fitZoom)
    
    return [
      Math.max(25, Math.round(fitZoom * 0.5)), // Half fit
      roundedFitZoom, // Fit to screen
      100, // Actual size
      Math.min(200, Math.round(fitZoom * 1.5)), // 1.5x fit
      Math.min(200, Math.round(fitZoom * 2)) // 2x fit
    ].filter((value, index, self) => self.indexOf(value) === index)
  }, [imageRef.current])

  // Memoize status display
  const statusDisplay = useMemo(() => 
    getStatusDisplay(docStatus?.status || '', currentPage, results.length),
    [docStatus?.status, currentPage, results.length]
  )

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
        case "Home":
          setCurrentPage(1)
          break
        case "End":
          setCurrentPage(results.length)
          break
        case "c":
          if (e.ctrlKey && currentResult?.text) {
            handleCopyText()
          }
          break
        case "f":
        case "/":
          if (!e.ctrlKey || e.key === "/") {
            e.preventDefault()
            const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement
            searchInput?.focus()
          }
          break
        case "+":
        case "=":
          if (e.ctrlKey) {
            e.preventDefault()
            handleZoomIn()
          }
          break
        case "-":
          if (e.ctrlKey) {
            e.preventDefault()
            handleZoomOut()
          }
          break
        case "0":
          if (e.ctrlKey) {
            e.preventDefault()
            handleZoomChange(100)
            setPanPosition({ x: 0, y: 0 })
          }
          break
        case "t":
        case "T":
          if (!e.ctrlKey) {
            e.preventDefault()
            // Find and click the text size button
            const textSizeButton = document.querySelector('button[class*="h-9"]:has(.lucide-type)') as HTMLButtonElement
            textSizeButton?.click()
          }
          break
        case "f":
        case "F":
          if (!e.ctrlKey) {
            e.preventDefault()
            if (document.fullscreenElement) {
              document.exitFullscreen()
            } else {
              document.documentElement.requestFullscreen()
            }
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [results.length, currentResult, handleCopyText, handleZoomIn, handleZoomOut, handleZoomChange])

  // Add drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 100) return // Only enable dragging when zoomed in
    
    const container = containerRef.current
    if (!container) return

    setIsDragging(true)
    dragRef.current = {
      startX: e.pageX - container.offsetLeft,
      startY: e.pageY - container.offsetTop,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragRef.current || !containerRef.current || zoomLevel <= 100) return

    e.preventDefault()
    const container = containerRef.current
    const dragStart = dragRef.current

    const x = e.pageX - container.offsetLeft
    const y = e.pageY - container.offsetTop
    const walkX = (x - dragStart.startX) * 1.5
    const walkY = (y - dragStart.startY) * 1.5

    container.scrollLeft = dragStart.scrollLeft - walkX
    container.scrollTop = dragStart.scrollTop - walkY
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    dragRef.current = null
  }

  // Add cleanup for mouse events
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false)
      dragRef.current = null
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  // Update pan handlers
  const handlePanStart = (e: React.MouseEvent) => {
    if (!imageContainerRef.current || zoomLevel <= 100) return
    
    e.preventDefault()
    setIsPanning(true)
    lastMousePosition.current = { x: e.clientX, y: e.clientY }
  }

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning || !imageContainerRef.current || zoomLevel <= 100) return

    e.preventDefault()
    const deltaX = e.clientX - lastMousePosition.current.x
    const deltaY = e.clientY - lastMousePosition.current.y
    lastMousePosition.current = { x: e.clientX, y: e.clientY }

    // Use requestAnimationFrame for smoother panning
    requestAnimationFrame(() => {
      setPanPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
    })
  }

  const handlePanEnd = () => {
    setIsPanning(false)
  }

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
            <div className="flex items-center gap-2">
              {docStatus?.type?.startsWith('image/') ? (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground" />
              )}
              <h1 className="text-lg font-semibold truncate max-w-[300px]">
                {docStatus?.filename}
              </h1>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const handlePageInputChange = (value: string) => {
    // Only allow numbers
    const numericValue = value.replace(/[^0-9]/g, '')
    setPageInputValue(numericValue)
  }

  const handlePageInputSubmit = () => {
    const newPage = parseInt(pageInputValue)
    if (newPage && newPage >= 1 && newPage <= (docStatus?.currentPage || results.length)) {
      setCurrentPage(newPage)
    } else {
      // Reset to current page if invalid
      setPageInputValue(currentPage.toString())
    }
    setIsEditingPage(false)
  }

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageInputSubmit()
    } else if (e.key === 'Escape') {
      setIsEditingPage(false)
      setPageInputValue(currentPage.toString())
    }
  }

  // Add this new function before renderControls
  const calculatePageFromPosition = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = x / rect.width
    return Math.max(1, Math.min(Math.round(percentage * results.length), results.length))
  }

  // Define KeyboardShortcuts component
  const KeyboardShortcuts = () => {
    const shortcuts = [
      {
        category: "Navigation",
        items: [
          { key: "←", description: "Previous page", action: () => setCurrentPage((p: number) => Math.max(1, p - 1)) },
          { key: "→", description: "Next page", action: () => setCurrentPage((p: number) => Math.min(results.length, p + 1)) },
        ]
      },
      {
        category: "Zoom",
        items: [
          { key: "Ctrl +", description: "Zoom in", action: handleZoomIn },
          { key: "Ctrl -", description: "Zoom out", action: handleZoomOut },
          { key: "Ctrl 0", description: "Reset zoom", action: () => { handleZoomChange(100); setPanPosition({ x: 0, y: 0 }); } },
        ]
      },
      {
        category: "Document",
        items: [
          { key: "Ctrl C", description: "Copy text", action: handleCopyText },
          { key: "/", description: "Focus search", action: () => {
            const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement
            searchInput?.focus()
          }},
        ]
      }
    ]

    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 px-3 gap-2 font-normal"
            >
              <Keyboard className="h-4 w-4" />
              <span className="text-sm hidden sm:inline-block">Shortcuts</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            align="end" 
            className="w-[280px] p-3 bg-popover/95 backdrop-blur supports-[backdrop-filter]:bg-popover/85"
            sideOffset={8}
          >
            <div className="space-y-4">
              {shortcuts.map((category) => (
                <div key={category.category} className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground/70 px-1 uppercase tracking-wider">
                    {category.category}
                  </h4>
                  <div className="space-y-1">
                    {category.items.map((shortcut) => (
                      <button
                        key={shortcut.key}
                        onClick={(e) => {
                          e.preventDefault()
                          shortcut.action()
                        }}
                        className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span className="text-muted-foreground">{shortcut.description}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.key.split(" ").map((key, keyIdx) => (
                            <kbd 
                              key={key}
                              className={cn(
                                "pointer-events-none inline-flex h-5 select-none items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
                                keyIdx > 0 && "ml-1"
                              )}
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="pt-1 mt-4 border-t">
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  Click any shortcut to trigger its action
                </p>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (error && docStatus?.status !== "cancelled") {
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

  if (docStatus?.status === "cancelled") {
    return (
      <div className="flex flex-col h-screen">
        {renderToolbar()}
        <div className="flex-1 bg-muted/5">
          <div className="container h-full flex items-center justify-center">
            <div className="w-full max-w-2xl p-8 text-center">
              <div className="mb-8">
                <div className="relative mx-auto h-24 w-24">
                  <div className="absolute inset-0 rounded-full border-4 border-dashed border-gray-200 dark:border-gray-800 animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-3 rounded-full bg-muted flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-500" />
                  </div>
                </div>
              </div>
              <h2 className="text-2xl font-semibold mb-4">Processing Cancelled</h2>
              <p className="text-muted-foreground mb-8">
                This document's processing was cancelled. You may want to try processing it again.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/documents')}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Documents
                </Button>
                <Button
                  variant="default"
                  onClick={() => router.push('/')}
                  className="w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Try Processing Again
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
              ) : isEditingPage ? (
                <Input
                  type="text"
                  value={pageInputValue}
                  onChange={(e) => handlePageInputChange(e.target.value)}
                  onBlur={handlePageInputSubmit}
                  onKeyDown={handlePageInputKeyDown}
                  className="h-7 w-16 px-2 text-center"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    setIsEditingPage(true)
                    setPageInputValue(currentPage.toString())
                  }}
                  className="text-sm hover:bg-accent hover:text-accent-foreground px-2 py-1 rounded"
                >
                  {currentPage} / {docStatus?.currentPage || results.length}
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage >= (docStatus?.currentPage || results.length) || isLoading}
              onClick={() => setCurrentPage((p) => Math.min(docStatus?.currentPage || results.length, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-1">
            {renderZoomControls()}
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
              disabled={isLoading || !results.length || docStatus?.status === "cancelled"}
              className={cn(
                "h-9",
                docStatus?.status === "cancelled" && "cursor-not-allowed"
              )}
            >
              {isDownloading ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  <span>Downloaded</span>
                </>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        <Download className="h-4 w-4 mr-2" />
                        <span>Download</span>
                      </div>
                    </TooltipTrigger>
                    {docStatus?.status === "cancelled" && (
                      <TooltipContent>
                        <p>Download is not available for cancelled files</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
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

  const renderZoomControls = () => (
    <div className="flex items-center gap-1 bg-muted/40 rounded-md p-1">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 flex items-center gap-1.5"
              onClick={() => {
                handleZoomChange(100)
                setPanPosition({ x: 0, y: 0 })
              }}
            >
              <ScanLine className="h-4 w-4" />
              <span className="text-xs">Reset</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset to 100%</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => handleZoomChange(Math.max(25, zoomLevel - 10))}
        disabled={zoomLevel <= 25}
      >
        <Minus className="h-4 w-4" />
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 min-w-[80px] font-medium"
          >
            {Math.round(zoomLevel)}%
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-[180px]">
          <div className="grid grid-cols-1 gap-0.5 p-1">
            {zoomPresets.map((zoom) => (
              <Button
                key={zoom}
                variant={Math.round(zoomLevel) === zoom ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-between"
                onClick={() => {
                  handleZoomChange(zoom)
                  if (zoom === 100) setPanPosition({ x: 0, y: 0 })
                }}
              >
                <span>{zoom}%</span>
                {zoom === 100 && (
                  <span className="text-xs text-muted-foreground">(Original)</span>
                )}
              </Button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => handleZoomChange(Math.min(200, zoomLevel + 10))}
        disabled={zoomLevel >= 200}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )

  const renderImageContent = () => {
    if (isLoading) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full">
            <Skeleton className="absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground animate-pulse">Loading document...</p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (docStatus?.status === "cancelled" && !results.length) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-md p-6 text-center">
                <div className="mb-6">
                  <div className="relative mx-auto h-24 w-24">
                    <div className="absolute inset-0 rounded-full border-4 border-dashed border-gray-200 dark:border-gray-800 animate-[spin_10s_linear_infinite]" />
                    <div className="absolute inset-3 rounded-full bg-muted flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">Processing Cancelled</h3>
                {(docStatus.currentPage ?? 0) > 0 ? (
                  <>
                    <p className="text-muted-foreground mb-6">
                      This document's processing was cancelled, but {docStatus.currentPage ?? 0} {(docStatus.currentPage ?? 0) === 1 ? 'page was' : 'pages were'} processed successfully.
                      Use the navigation controls above to view the processed pages.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row items-center justify-center">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push('/documents')}
                        className="w-full sm:w-auto"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Documents
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-6">
                      This document's processing was cancelled before any pages could be processed.
                      You may want to try processing it again.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row items-center justify-center">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push('/documents')}
                        className="w-full sm:w-auto"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Documents
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => router.push('/')}
                        className="w-full sm:w-auto"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Try Processing Again
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (!currentResult?.imageUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full border-2 border-dashed rounded-lg bg-muted/5">
            <p className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              No preview available
            </p>
          </div>
        </div>
      )
    }

    const cachedImage = imageCache.get(currentResult.imageUrl)
    const showLoadingState = !imageLoaded && !cachedImage

    return (
      <div 
        ref={imageContainerRef}
        className={cn(
          "relative w-full h-full",
          zoomLevel > 100 ? "overflow-auto" : "overflow-hidden",
          isPanning && "cursor-grabbing",
          zoomLevel > 100 && !isPanning && "cursor-grab"
        )}
        onMouseDown={handlePanStart}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
      >
        <div className="min-h-full flex items-center justify-center p-4">
          <div
            className="relative will-change-transform"
            style={{
              transform: `scale(${zoomLevel / 100}) translate(${panPosition.x}px, ${panPosition.y}px)`,
              transformOrigin: 'center',
              transition: isPanning ? 'none' : 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {showLoadingState && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/5">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground animate-pulse">
                    {isRetrying ? "Retrying..." : "Loading preview..."}
                  </p>
                </div>
              </div>
            )}

            <img
              ref={imageRef}
              key={`${currentResult.imageUrl}-${retryCount}`}
              src={currentResult.imageUrl}
              alt={`Page ${currentPage}`}
              className={cn(
                "max-h-[calc(100vh-14rem)] w-auto rounded-lg select-none",
                (imageLoaded || cachedImage) && !imageError ? "opacity-100" : "opacity-0",
                "transition-opacity duration-300",
                "will-change-transform"
              )}
              onLoad={handleImageLoad}
              onError={handleImageError}
              draggable={false}
              loading="eager"
              decoding="async"
            />

            {imageError && renderImageError(currentResult.imageUrl)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {renderToolbar()}
      {renderControls()}
      
      <div className="flex-1 overflow-hidden bg-muted/5">
        <div className="container h-full py-6">
          <div className="grid grid-cols-2 gap-6 h-full">
            {/* Source Document View */}
            <div className="bg-background rounded-lg shadow-sm overflow-hidden flex flex-col border">
              <div className="px-4 py-3 border-b bg-muted/20">
                <h2 className="text-sm font-medium">Source Document</h2>
              </div>
              <div className="flex-1 relative">
                <div 
                  ref={containerRef}
                  className="absolute inset-0"
                >
                  {renderImageContent()}
                </div>
              </div>
            </div>

            {/* Extracted Text View */}
            <div className="bg-background rounded-lg shadow-sm overflow-hidden flex flex-col border">
              <div className="px-4 py-3 border-b bg-muted/20">
                <h2 className="text-sm font-medium">Extracted Text</h2>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6">
                  {isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-[92%]" />
                      <Skeleton className="h-5 w-[88%]" />
                      <Skeleton className="h-5 w-[95%]" />
                      <Skeleton className="h-5 w-[90%]" />
                    </div>
                  ) : docStatus?.status === "failed" && !currentResult ? (
                    <div className="flex items-center justify-center h-full min-h-[200px] text-center">
                      <div className="max-w-sm">
                        <p className="text-muted-foreground">
                          {(docStatus.currentPage || 0) > 0
                            ? "Select a processed page to view its extracted text"
                            : "No text was extracted before processing was cancelled"}
                        </p>
                      </div>
                    </div>
                  ) : currentResult ? (
                    <div
                      dir={currentResult.language === "ar" || currentResult.language === "fa" ? "rtl" : "ltr"}
                      lang={currentResult.language}
                      style={{ fontSize: `${textSize}px` }}
                      className="max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed"
                    >
                      {currentResult.text}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground">
                      No text extracted for this page
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      {!isLoading && results.length > 1 && docStatus?.status !== "processing" && docStatus?.status !== "pending" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
          <div className="bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60 shadow-lg rounded-full border px-3 py-1.5 flex items-center gap-3">
            <div className="relative group">
              <Progress 
                value={(currentPage / results.length) * 100} 
                className="w-48 h-1.5 cursor-pointer relative z-10"
                onClick={(e) => {
                  const newPage = calculatePageFromPosition(e.clientX, e.currentTarget)
                  setCurrentPage(newPage)
                }}
                onMouseMove={(e) => {
                  const tooltip = e.currentTarget.parentElement?.querySelector('[data-hover-tooltip]')
                  if (tooltip) {
                    const newPage = calculatePageFromPosition(e.clientX, e.currentTarget)
                    const percentage = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth
                    const tooltipWidth = tooltip.getBoundingClientRect().width
                    const maxOffset = e.currentTarget.offsetWidth - tooltipWidth
                    const offset = Math.max(0, Math.min(percentage * e.currentTarget.offsetWidth - tooltipWidth / 2, maxOffset))
                    
                    // Update tooltip content and position
                    const pageSpan = tooltip.querySelector('[data-page]')
                    if (pageSpan) {
                      pageSpan.textContent = newPage.toString()
                    }
                    ;(tooltip as HTMLElement).style.transform = `translateX(${offset}px)`
                    tooltip.classList.remove('opacity-0')
                  }
                }}
                onMouseLeave={(e) => {
                  const tooltip = e.currentTarget.parentElement?.querySelector('[data-hover-tooltip]')
                  if (tooltip) {
                    tooltip.classList.add('opacity-0')
                  }
                }}
              />
              {/* Hover tooltip */}
              <div
                data-hover-tooltip
                className="absolute -top-7 opacity-0 transition-all duration-100 bg-popover text-popover-foreground px-2 py-1 rounded shadow-md text-xs whitespace-nowrap pointer-events-none"
              >
                Go to page <span data-page>1</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Page {currentPage} of {results.length}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

