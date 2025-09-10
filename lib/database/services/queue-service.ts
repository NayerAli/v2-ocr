// Queue-related database operations

import type { ProcessingStatus } from '@/types'
import { isSupabaseConfigured, mapToProcessingStatus, camelToSnake } from '../utils'
import { getRuntimeSupabase } from '@/lib/supabase/runtime-client'

async function getCurrentUser() {
  if (typeof window !== 'undefined') {
    const { getUser } = await import('../../auth-client')
    return getUser()
  }
  // Avoid importing server-only modules in shared code
  return null
}

/**
 * Get all queue items for the current user
 */
export async function getQueue(): Promise<ProcessingStatus[]> {
  // Only log in development mode and not too frequently
  const shouldLog = process.env.NODE_ENV === 'development' && Math.random() < 0.05;

  if (shouldLog) {
    console.log('[DEBUG] supabase-db.getQueue called');
  }

  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot get queue.')
    return []
  }

  // Get the current user
  if (shouldLog) {
    console.log('[DEBUG] Getting current user');
  }
  const user = await getCurrentUser()
  if (shouldLog) {
    console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');
  }

  // Build the query
  if (shouldLog) {
    console.log('[DEBUG] Building Supabase query');
  }
  const supabase = await getRuntimeSupabase()
  if (!supabase) {
    console.error('[DEBUG] No Supabase client available')
    return []
  }
  let query = supabase
    .from('documents')
    .select('*')

  // If user is authenticated, filter by user_id
  if (user) {
    if (shouldLog) {
      console.log('[DEBUG] Adding user filter to query, user ID:', user.id);
    }
    query = query
      .eq('user_id', user.id)
      // Include all statuses including 'completed' and 'error'
      .in('status', ['pending', 'processing', 'queued', 'completed', 'failed', 'cancelled', 'error'])
  } else {
    if (shouldLog) {
      console.log('[DEBUG] No user filter applied to query');
    }
    // For backward compatibility, still filter by status
    query = query.in('status', ['pending', 'processing', 'queued', 'completed', 'failed', 'cancelled', 'error'])
  }

  // Order by created_at
  query = query.order('created_at', { ascending: false })

  // Execute the query
  if (shouldLog) {
    console.log('[DEBUG] Executing Supabase query');
  }
  const { data, error } = await query

  if (error) {
    console.error('[DEBUG] Error fetching queue:', error)
    return []
  }

  if (shouldLog) {
    console.log('[DEBUG] Query successful, raw data items:', data ? data.length : 0);

    // Log status distribution
    if (data && data.length > 0) {
      const statusCounts = data.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
      console.log('[DEBUG] Status distribution:', statusCounts);
    }
  }

  const queue = data.map(mapToProcessingStatus)

  if (shouldLog) {
    console.log('[DEBUG] Mapped queue items:', queue.length);

    // Log mapped status distribution
    if (queue.length > 0) {
      const mappedStatusCounts = queue.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
      console.log('[DEBUG] Mapped status distribution:', mappedStatusCounts);
    }
  }

  return queue
}

/**
 * Add a document to the queue
 */
export async function saveToQueue(status: ProcessingStatus): Promise<void> {
  // Only log in development mode and not too frequently
  const shouldLog = process.env.NODE_ENV === 'development' && Math.random() < 0.1;

  if (shouldLog) {
    console.log('[DEBUG] saveToQueue called with status:', status.id, status.filename, status.status);
  }

  if (!isSupabaseConfigured()) {
    console.error('[DEBUG] Supabase not configured. Cannot save to queue.')
    return
  }

  // If running on the server and no user_id provided, avoid inserting invalid rows
  if (typeof window === 'undefined' && !(status as unknown as Record<string, unknown>).user_id) {
    console.error('[DEBUG] Missing user_id on server saveToQueue call; aborting to prevent invalid insert')
    return
  }

  // Get the current user
  if (shouldLog) {
    console.log('[DEBUG] Getting current user for saveToQueue');
  }
  const user = await getCurrentUser()
  if (shouldLog) {
    console.log('[DEBUG] Current user for saveToQueue:', user ? 'Authenticated' : 'Not authenticated');
  }

  // Ensure dates are properly set and remove the file field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { file, ...statusWithoutFile } = status
  if (shouldLog) {
    console.log('[DEBUG] Removed file from status object');
  }

  // Map old field names to new field names if they exist
  // Cast to handle legacy fields that might be present
  const statusAny = statusWithoutFile as Record<string, unknown>;

  const mappedStatus = {
    ...statusWithoutFile,
    // Map size to fileSize if size exists and fileSize doesn't
    fileSize: statusWithoutFile.fileSize || (statusAny.size as number | undefined),
    // Map type to fileType if type exists and fileType doesn't
    fileType: statusWithoutFile.fileType || (statusAny.type as string | undefined),
    // Ensure storagePath is set
    storagePath: statusWithoutFile.storagePath || `${statusWithoutFile.id}${statusWithoutFile.fileType || '.unknown'}`,
    // Map startTime to processingStartedAt if startTime exists and processingStartedAt doesn't
    processingStartedAt: statusWithoutFile.processingStartedAt ||
      (statusAny.startTime && typeof statusAny.startTime === 'string' || typeof statusAny.startTime === 'number' ?
        new Date(statusAny.startTime as string | number) : undefined),
    // Map endTime to processingCompletedAt if endTime exists and processingCompletedAt doesn't
    processingCompletedAt: statusWithoutFile.processingCompletedAt ||
      (statusAny.endTime && typeof statusAny.endTime === 'string' || typeof statusAny.endTime === 'number' ?
        new Date(statusAny.endTime as string | number) : undefined),
  }

  // Extract legacy fields that might be present but are no longer used
  // We're explicitly ignoring these variables as they're extracted but not used
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { size, type, startTime, endTime, ...cleanedStatus } = mappedStatus as Record<string, unknown>

  const existingUserId = (cleanedStatus as Record<string, unknown>).user_id as unknown
  const hasValidUserId = typeof existingUserId === 'string' && existingUserId.length > 0
  const updatedStatus = {
    ...cleanedStatus,
    status: status.status || 'queued', // Ensure status is set, default to 'queued'
    createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
    updatedAt: new Date(),
    ...(hasValidUserId ? {} : { user_id: user?.id ?? null })
  }
  if (shouldLog) {
    console.log('[DEBUG] Created updated status object with dates and user_id');
  }

  // Convert to snake_case for Supabase
  const snakeCaseStatus = camelToSnake(updatedStatus)
  if (shouldLog) {
    console.log('[DEBUG] Converted to snake_case for Supabase');
  }

  // Add some debug logging
  if (shouldLog) {
    // Use a type assertion to access properties for logging purposes
    const logData = {
      status: updatedStatus.status,
      user_id: updatedStatus.user_id,
      // Access other properties safely with type assertion
      id: (status as unknown as { id?: string })?.id,
      filename: (status as unknown as { filename?: string })?.filename
    }
    console.log('[DEBUG] Saving to queue:', logData)
  }

  try {
    // Upsert to Supabase
    if (shouldLog) {
      console.log('[DEBUG] Executing Supabase upsert operation');
    }
    const supabase = await getRuntimeSupabase()
    if (!supabase) {
      console.error('[DEBUG] No Supabase client available for upsert')
      return
    }
    const { data, error } = await supabase
      .from('documents')
      .upsert(snakeCaseStatus)
      .select()

    if (error) {
      console.error('[DEBUG] Error saving to queue:', error)
      return
    }

    if (shouldLog) {
      console.log('[DEBUG] Supabase upsert successful, returned data:', data ? data.length : 0);
    }
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
  const user = await getCurrentUser()
  console.log('[DEBUG] Current user for removeFromQueue:', user ? 'Authenticated' : 'Not authenticated');

  if (!user) {
    console.error('[DEBUG] User not authenticated. Cannot remove from queue.')
    return
  }

  try {
    // Delete from ocr_results first
    console.log('[DEBUG] Deleting results for document:', id);
    const supabase = await getRuntimeSupabase()
    if (!supabase) {
      console.error('[DEBUG] No Supabase client available for delete')
      return
    }
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
  const supabaseClient = await getRuntimeSupabase()
  if (!supabaseClient) {
    console.error('[DEBUG] No Supabase client available for updateQueueItem')
    return null
  }
  const { data: userData } = await supabaseClient.auth.getUser()
  const user = userData.user
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
    const supabase = supabaseClient
    if (!supabase) {
      console.error('[DEBUG] No Supabase client available for update')
      return null
    }
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
