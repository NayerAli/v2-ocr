import { createClient } from '@/utils/supabase/server-wrapper'

/**
 * Download a file from Supabase storage and return it as a File object
 */
export async function downloadFileFromStorage(
  storagePath: string,
  bucket: string = 'ocr-documents'
): Promise<File> {
  const supabase = createClient()
  
  // Get the file data from Supabase storage
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath)
  
  if (error || !data) {
    throw new Error(`Failed to download file from storage: ${error?.message || 'Unknown error'}`)
  }
  
  // Extract filename from path
  const filename = storagePath.split('/').pop() || 'file.unknown'
  
  // Convert to File object with appropriate type
  const fileType = getFileTypeFromName(filename)
  return new File([data], filename, { type: fileType })
}

/**
 * Get file type based on extension
 */
function getFileTypeFromName(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || ''
  
  switch (extension) {
    case 'pdf':
      return 'application/pdf'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
} 