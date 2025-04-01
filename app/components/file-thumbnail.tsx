"use client"

import { useState, useEffect } from "react"
import { FileText, ImageIcon, Loader2, Cloud } from "lucide-react"
import Image from "next/image"
import { createFileStorageAdapter } from "@/lib/ocr/file-storage-adapter"
import type { ProcessingStatus } from "@/types"

interface FileThumbnailProps {
  document: ProcessingStatus
  size?: 'sm' | 'md' | 'lg'
  showStorageIcon?: boolean
}

export function FileThumbnail({ document, size = 'md', showStorageIcon = true }: FileThumbnailProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const fileStorage = createFileStorageAdapter()
  
  // Determine size classes
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-16 w-16',
    lg: 'h-24 w-24'
  }
  
  const iconSizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }
  
  useEffect(() => {
    // Reset state when document changes
    setImageSrc(null)
    
    // Only try to get preview for image files
    const isImage = document.fileType?.startsWith('image/') || 
                    (document.file && document.file.type.startsWith('image/'))
    
    if (!isImage) return
    
    const loadImagePreview = async () => {
      setIsLoading(true)
      try {
        // Get file data from adapter (handles both local and remote files)
        const fileData = await fileStorage.getFileData(document)
        
        if (!fileData) {
          console.warn('No file data available for preview')
          return
        }
        
        // Create object URL for the file
        const url = URL.createObjectURL(fileData)
        setImageSrc(url)
        
        // Clean up object URL when component unmounts
        return () => {
          URL.revokeObjectURL(url)
        }
      } catch (error) {
        console.error('Error loading file preview:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadImagePreview()
  }, [document, fileStorage])
  
  // Show loading spinner
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-muted/50 rounded-md ${sizeClasses[size]}`}>
        <Loader2 className={`animate-spin text-muted-foreground ${iconSizeClasses[size]}`} />
      </div>
    )
  }
  
  // Show image preview if available
  if (imageSrc) {
    return (
      <div className={`relative ${sizeClasses[size]} rounded-md overflow-hidden border`}>
        <Image 
          src={imageSrc} 
          alt={document.filename}
          fill
          className="object-cover"
        />
        {showStorageIcon && document.fileUrl && (
          <div className="absolute bottom-0 right-0 bg-primary/80 p-0.5 rounded-tl-md">
            <Cloud className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    )
  }
  
  // Show appropriate file icon based on type
  return (
    <div className={`relative flex items-center justify-center bg-muted/30 rounded-md border ${sizeClasses[size]}`}>
      {document.fileType?.startsWith('image/') ? (
        <ImageIcon className={`text-muted-foreground ${iconSizeClasses[size]}`} />
      ) : (
        <FileText className={`text-muted-foreground ${iconSizeClasses[size]}`} />
      )}
      {showStorageIcon && document.fileUrl && (
        <div className="absolute bottom-0 right-0 bg-primary/80 p-0.5 rounded-tl-md">
          <Cloud className="h-3 w-3 text-white" />
        </div>
      )}
    </div>
  )
} 