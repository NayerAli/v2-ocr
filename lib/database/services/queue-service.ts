// Queue-related database operations

import { getUser } from '../../auth'
import type { ProcessingStatus } from '@/types'
import { supabase, isSupabaseConfigured, mapToProcessingStatus, camelToSnake } from '../utils'

/**
 * Get all queue items for the current user
 */
export async function getQueue(): Promise<ProcessingStatus[]> {
  console.log('[DEBUG] supabase-db.getQueue called');

  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot get queue.')
    return []
  }

  // Get the current user
  console.log('[DEBUG] Getting current user');
  const user = await getUser()
  console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');

  // Build the query
  console.log('[DEBUG] Building Supabase query');
  let query = supabase
    .from('documents')
    .select('*')

  // If user is authenticated, filter by user_id and status
  if (user) {
    console.log('[DEBUG] Adding user filter to query, user ID:', user.id);
    query = query
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing', 'queued'])
  } else {
    console.log('[DEBUG] No user filter applied to query');
    // For backward compatibility, still filter by status
    query = query.in('status', ['pending', 'processing', 'queued'])
  }

  // Order by created_at
  query = query.order('created_at', { ascending: false })

  // Execute the query
  console.log('[DEBUG] Executing Supabase query');
  const { data, error } = await query

  if (error) {
    console.error('[DEBUG] Error fetching queue:', error)
    return []
  }

  console.log('[DEBUG] Query successful, raw data items:', data ? data.length : 0);
  const queue = data.map(mapToProcessingStatus)
  console.log('[DEBUG] Mapped queue items:', queue.length);

  return queue
}

/**
 * Add a document to the queue
 */
export async function saveToQueue(status: ProcessingStatus): Promise<void> {
  console.log('[DEBUG] saveToQueue called with status:', status.id, status.filename, status.status);

  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot save to queue.')
    return
  }

  // Get the current user
  console.log('[DEBUG] Getting current user for saveToQueue');
  const user = await getUser()
  console.log('[DEBUG] Current user for saveToQueue:', user ? 'Authenticated' : 'Not authenticated');

  // Ensure dates are properly set and remove the file field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { file, ...statusWithoutFile } = status
  console.log('[DEBUG] Removed file from status object');

  const updatedStatus = {
    ...statusWithoutFile,
    status: status.status || 'queued', // Ensure status is set, default to 'queued'
    createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
    updatedAt: new Date(),
    // Add user_id if user is authenticated
    user_id: user?.id || null
  }
  console.log('[DEBUG] Created updated status object with dates and user_id');

  // Convert to snake_case for Supabase
  const snakeCaseStatus = camelToSnake(updatedStatus)
  console.log('[DEBUG] Converted to snake_case for Supabase');

  // Add some debug logging
  console.log('[DEBUG] Saving to queue:', { id: updatedStatus.id, filename: updatedStatus.filename, status: updatedStatus.status, user_id: updatedStatus.user_id })

  try {
    // Upsert to Supabase
    console.log('[DEBUG] Executing Supabase upsert operation');
    const { data, error } = await supabase
      .from('documents')
      .upsert(snakeCaseStatus)
      .select()

    if (error) {
      console.error('[DEBUG] Error saving to queue:', error)
      return
    }

    console.log('[DEBUG] Supabase upsert successful, returned data:', data ? data.length : 0);
  } catch (err) {
    console.error('[DEBUG] Exception saving to queue:', err)
    return
  }
}

/**
 * Add a document to the queue (new function with more explicit name)
 */
export async function addToQueue(document: Partial<ProcessingStatus>): Promise<void> {
  // Set status to queued explicitly
  const queuedDocument = {
    ...document,
    status: 'queued'
  }

  // Use the existing saveToQueue function
  return saveToQueue(queuedDocument as ProcessingStatus);
}

/**
 * Remove a document from the queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  console.log('[DEBUG] removeFromQueue called for id:', id);

  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot remove from queue.')
    return
  }

  // Get the current user
  const user = await getUser()
  console.log('[DEBUG] Current user for removeFromQueue:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot remove from queue.')
    return
  }

  try {
    // Delete from ocr_results first
    console.log('[DEBUG] Deleting results for document:', id);
    const { error: resultsError } = await supabase
      .from('ocr_results')
      .delete()
      .eq('document_id', id)
      .eq('user_id', user.id) // Add user_id filter

    if (resultsError) {
      console.error('[DEBUG] Error removing results:', resultsError)
    } else {
      console.log('[DEBUG] Results deleted successfully');
    }

    // Then delete from documents
    console.log('[DEBUG] Deleting document:', id);
    const { error: documentError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) // Add user_id filter

    if (documentError) {
      console.error('[DEBUG] Error removing document:', documentError)
    } else {
      console.log('[DEBUG] Document deleted successfully');
    }

    console.log('[DEBUG] Document removed successfully');
  } catch (error) {
    console.error('[DEBUG] Exception in removeFromQueue:', error);
  }
}

/**
 * Update a queue item
 */
export async function updateQueueItem(id: string, updates: Partial<ProcessingStatus>): Promise<ProcessingStatus | null> {
  console.log('[DEBUG] updateQueueItem called for id:', id);

  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot update queue item.')
    return null
  }

  // Get the current user
  const user = await getUser()
  console.log('[DEBUG] Current user for updateQueueItem:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot update queue item.')
    return null
  }

  try {
    // Prepare the update object
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    // Convert to snake_case for Supabase
    const snakeCaseUpdates = camelToSnake(updateData)

    // Update the document
    console.log('[DEBUG] Updating document:', id);
    const { data, error } = await supabase
      .from('documents')
      .update(snakeCaseUpdates)
      .eq('id', id)
      .eq('user_id', user.id) // Add user_id filter
      .select()
      .single()

    if (error) {
      console.error('[DEBUG] Error updating document:', error)
      return null
    }

    console.log('[DEBUG] Document updated successfully');
    return mapToProcessingStatus(data)
  } catch (error) {
    console.error('[DEBUG] Exception in updateQueueItem:', error);
    return null
  }
}
