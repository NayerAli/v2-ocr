import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from './supabase'

// Storage bucket name from environment or default
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'ocr-documents'

/**
 * Uploads a file to Supabase Storage
 * @param file The file to upload
 * @param path Optional path within the bucket (e.g., 'user123/documents')
 * @returns URL of the uploaded file or null if upload failed
 */
export async function uploadFile(file: File, path?: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    
    // Generate a unique file name to avoid collisions
    const fileExtension = file.name.split('.').pop()
    const fileName = `${uuidv4()}.${fileExtension}`
    
    // Create full path including optional subfolder
    const fullPath = path ? `${path}/${fileName}` : fileName
    
    // Upload file
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fullPath, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (error) throw error
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path)
    
    return urlData.publicUrl
  } catch (error) {
    console.error('Error uploading file:', error)
    return null
  }
}

/**
 * Deletes a file from Supabase Storage
 * @param url The public URL of the file to delete
 * @returns true if delete was successful, false otherwise
 */
export async function deleteFile(url: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()
    
    // Extract path from URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    
    // Find the part after the bucket name
    const bucketIndex = pathParts.findIndex(part => part === STORAGE_BUCKET)
    if (bucketIndex === -1) return false
    
    const path = pathParts.slice(bucketIndex + 1).join('/')
    
    // Delete file
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path])
    
    if (error) throw error
    
    return true
  } catch (error) {
    console.error('Error deleting file:', error)
    return false
  }
}

/**
 * Downloads a file from Supabase Storage
 * @param url The public URL of the file to download
 * @returns Blob of the file or null if download failed
 */
export async function downloadFile(url: string): Promise<Blob | null> {
  try {
    const supabase = getSupabaseClient()
    
    // Extract path from URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    
    // Find the part after the bucket name
    const bucketIndex = pathParts.findIndex(part => part === STORAGE_BUCKET)
    if (bucketIndex === -1) return null
    
    const path = pathParts.slice(bucketIndex + 1).join('/')
    
    // Download file
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(path)
    
    if (error) throw error
    
    return data
  } catch (error) {
    console.error('Error downloading file:', error)
    return null
  }
} 