// Document management operations

import { getUser } from '../../auth'
import type { ProcessingStatus } from '@/types'
import { supabase, isSupabaseConfigured, mapToProcessingStatus, camelToSnake } from '../utils'

/**
 * Get all documents for the current user
 */
export async function getDocuments(): Promise<ProcessingStatus[]> {
  console.log('[DEBUG] getDocuments called');
  
  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot get documents.')
    return []
  }

  // Get the current user
  console.log('[DEBUG] Getting current user');
  const user = await getUser()
  console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot get documents.')
    return []
  }

  // Build the query
  console.log('[DEBUG] Building Supabase query');
  const query = supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Execute the query
  console.log('[DEBUG] Executing Supabase query');
  const { data, error } = await query

  if (error) {
    console.error('[DEBUG] Error fetching documents:', error)
    return []
  }

  console.log('[DEBUG] Query successful, raw data items:', data ? data.length : 0);
  const documents = data.map(mapToProcessingStatus)
  console.log('[DEBUG] Mapped document items:', documents.length);

  return documents
}

/**
 * Get a specific document by ID
 */
export async function getDocument(id: string): Promise<ProcessingStatus | null> {
  console.log('[DEBUG] getDocument called for id:', id);
  
  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot get document.')
    return null
  }

  // Get the current user
  console.log('[DEBUG] Getting current user');
  const user = await getUser()
  console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot get document.')
    return null
  }

  // Build the query
  console.log('[DEBUG] Building Supabase query');
  const query = supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  // Execute the query
  console.log('[DEBUG] Executing Supabase query');
  const { data, error } = await query

  if (error) {
    console.error('[DEBUG] Error fetching document:', error)
    return null
  }

  if (!data) {
    console.error('[DEBUG] Document not found or not owned by user')
    return null
  }

  console.log('[DEBUG] Query successful, document found');
  const document = mapToProcessingStatus(data)
  console.log('[DEBUG] Mapped document:', document.id, document.filename);

  return document
}

/**
 * Save a document
 */
export async function saveDocument(document: Partial<ProcessingStatus>): Promise<ProcessingStatus | null> {
  console.log('[DEBUG] saveDocument called with document:', document.id, document.filename);
  
  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot save document.')
    return null
  }

  // Get the current user
  console.log('[DEBUG] Getting current user');
  const user = await getUser()
  console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot save document.')
    return null
  }

  // Ensure required fields are present
  if (!document.filename || !document.originalFilename || !document.fileSize ||
      !document.fileType || !document.storagePath) {
    console.error('[DEBUG] Missing required document fields')
    return null
  }

  // Prepare document with user_id and timestamps
  const documentWithUser = {
    ...document,
    user_id: user.id,
    status: document.status || 'pending',
    createdAt: document.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // If it's a new document, generate an ID
    id: document.id || crypto.randomUUID()
  }

  // Convert to snake_case for Supabase
  const snakeCaseDocument = camelToSnake(documentWithUser)
  console.log('[DEBUG] Converted to snake_case for Supabase');

  // Add some debug logging
  console.log('[DEBUG] Saving document:', { id: documentWithUser.id, filename: documentWithUser.filename, status: documentWithUser.status, user_id: documentWithUser.user_id })

  try {
    // Upsert to Supabase
    console.log('[DEBUG] Executing Supabase upsert operation');
    const { data, error } = await supabase
      .from('documents')
      .upsert(snakeCaseDocument, { onConflict: 'id' })
      .select()
      .single()

    if (error) {
      console.error('[DEBUG] Error saving document:', error)
      return null
    }

    console.log('[DEBUG] Supabase upsert successful');
    return mapToProcessingStatus(data)
  } catch (err) {
    console.error('[DEBUG] Exception saving document:', err)
    return null
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(id: string): Promise<boolean> {
  console.log('[DEBUG] deleteDocument called for id:', id);
  
  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot delete document.')
    return false
  }

  // Get the current user
  console.log('[DEBUG] Getting current user');
  const user = await getUser()
  console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot delete document.')
    return false
  }

  try {
    // First, check if the document exists and belongs to the user
    console.log('[DEBUG] Verifying document ownership');
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id, storage_path, thumbnail_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !document) {
      console.error('[DEBUG] Error verifying document ownership:', documentError)
      return false
    }

    // Delete the document from storage if it exists
    if (document.storage_path) {
      console.log('[DEBUG] Deleting document from storage:', document.storage_path);
      const { error: storageError } = await supabase
        .storage
        .from('documents')
        .remove([document.storage_path])

      if (storageError) {
        console.error('[DEBUG] Error deleting document from storage:', storageError)
        // Continue with deletion even if storage removal fails
      }
    }

    // Delete the thumbnail from storage if it exists
    if (document.thumbnail_path) {
      console.log('[DEBUG] Deleting thumbnail from storage:', document.thumbnail_path);
      const { error: thumbnailError } = await supabase
        .storage
        .from('thumbnails')
        .remove([document.thumbnail_path])

      if (thumbnailError) {
        console.error('[DEBUG] Error deleting thumbnail from storage:', thumbnailError)
        // Continue with deletion even if thumbnail removal fails
      }
    }

    // Delete OCR results for this document
    console.log('[DEBUG] Deleting OCR results for document:', id);
    const { error: resultsError } = await supabase
      .from('ocr_results')
      .delete()
      .eq('document_id', id)
      .eq('user_id', user.id)

    if (resultsError) {
      console.error('[DEBUG] Error deleting OCR results:', resultsError)
      // Continue with deletion even if results removal fails
    }

    // Delete the document from the database
    console.log('[DEBUG] Deleting document from database:', id);
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[DEBUG] Error deleting document:', error)
      return false
    }

    console.log('[DEBUG] Document deleted successfully');
    return true
  } catch (error) {
    console.error('[DEBUG] Exception in deleteDocument:', error);
    return false
  }
}
