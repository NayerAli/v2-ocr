// Queue-related database operations

import { getSupabaseClient, isSupabaseConfigured, mapToProcessingStatus, camelToSnake } from '../utils'
import { getUser } from '../../auth'
import type { ProcessingStatus } from '@/types'

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

  // Determine if we're in a server context
  const isServer = typeof window === 'undefined';
  let client;
  let userId = null;

  if (isServer) {
    // In server context, use the service client to bypass RLS
    const { getServiceClient } = await import('../utils/service-client');
    client = getServiceClient();
    if (shouldLog) {
      console.log('[DEBUG] Using service client in server context for getQueue');
    }
  } else {
    // In client context, use the regular client with user authentication
    client = getSupabaseClient();

    // Get the current user and bail if not authenticated
    const user = await getUser();
    userId = user?.id;

    if (!userId) {
      if (shouldLog) console.error('[DEBUG] No authenticated user found. Cannot get queue.');
      return []
    }

    if (shouldLog) {
      console.log('[DEBUG] Using regular client in client context for getQueue');
      console.log('[DEBUG] Current user:', user ? 'Authenticated' : 'Not authenticated');
    }
  }

  if (!client) {
    console.error('[DEBUG] Failed to create Supabase client');
    return [];
  }

  // Build the query
  if (shouldLog) {
    console.log('[DEBUG] Building Supabase query');
  }
  let query = client
    .from('documents')
    .select('*')

  // If in client context and user is authenticated, filter by user_id
  if (!isServer && userId) {
    if (shouldLog) console.log('[DEBUG] Adding user filter to query, user ID:', userId);
    query = query.eq('user_id', userId);
  }

  // Include all statuses
  query = query.in('status', ['pending', 'processing', 'queued', 'completed', 'failed', 'cancelled', 'error']);

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

  // Get the current user
  if (shouldLog) {
    console.log('[DEBUG] Getting current user for saveToQueue');
  }
  const user = await getUser()
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
    // Ensure originalFilename is set, defaulting to filename if not provided
    originalFilename: statusWithoutFile.originalFilename || statusWithoutFile.filename,
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

  const updatedStatus = {
    ...cleanedStatus,
    status: status.status || 'queued', // Ensure status is set, default to 'queued'
    createdAt: status.createdAt instanceof Date ? status.createdAt : new Date(status.createdAt || Date.now()),
    updatedAt: new Date(),
    // Add user_id, prioritizing existing user_id in status, then authenticated user, then fallback to a default
    user_id: status.user_id || user?.id || '2f4a9512-414a-47cc-a1d1-a110739085f8' // Fallback to test user ID if needed
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
    // Determine if we're in a server context
    const isServer = typeof window === 'undefined';
    let client;

    if (isServer) {
      try {
        // In server context, use the service client to bypass RLS
        const { getServiceClient } = await import('../utils/service-client');
        client = getServiceClient();
        if (shouldLog) {
          console.log('[DEBUG] Using service client in server context');
        }
      } catch (error) {
        console.error('[DEBUG] Error importing service client:', error);
        client = getSupabaseClient();
      }
    } else {
      // In client context, use the regular client with user authentication
      client = getSupabaseClient();
      if (shouldLog) {
        console.log('[DEBUG] Using regular client in client context');
      }
    }

    if (!client) {
      console.error('[DEBUG] Failed to create Supabase client');
      return;
    }

    // Upsert to Supabase
    if (shouldLog) {
      console.log('[DEBUG] Executing Supabase upsert operation');
    }
    const { data, error } = await client
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
  // Set status to queued explicitly and ensure originalFilename is set
  const queuedDocument = {
    ...document,
    status: 'queued',
    // Ensure originalFilename is set, defaulting to filename if not provided
    originalFilename: document.originalFilename || document.filename
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
    // Determine if we're in a server context
    const isServer = typeof window === 'undefined';
    let client;

    if (isServer) {
      // In server context, use the service client to bypass RLS
      const { getServiceClient } = await import('../utils/service-client');
      client = getServiceClient();
      console.log('[DEBUG] Using service client in server context for removeFromQueue');
    } else {
      // In client context, use the regular client with user authentication
      client = getSupabaseClient();
      console.log('[DEBUG] Using regular client in client context for removeFromQueue');
    }

    if (!client) {
      console.error('[DEBUG] Failed to create Supabase client');
      return;
    }

    // Delete from ocr_results first
    console.log('[DEBUG] Deleting results for document:', id);
    let resultsQuery = client
      .from('ocr_results')
      .delete()
      .eq('document_id', id);

    // Only add user_id filter in client context
    if (!isServer && user.id) {
      resultsQuery = resultsQuery.eq('user_id', user.id);
    }

    const { error: resultsError } = await resultsQuery;

    if (resultsError) {
      console.error('[DEBUG] Error removing results:', resultsError)
    } else {
      console.log('[DEBUG] Results deleted successfully');
    }

    // Then delete from documents
    console.log('[DEBUG] Deleting document:', id);
    let documentQuery = client
      .from('documents')
      .delete()
      .eq('id', id);

    // Only add user_id filter in client context
    if (!isServer && user.id) {
      documentQuery = documentQuery.eq('user_id', user.id);
    }

    const { error: documentError } = await documentQuery;

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
    // Determine if we're in a server context
    const isServer = typeof window === 'undefined';
    let client;

    if (isServer) {
      // In server context, use the service client to bypass RLS
      const { getServiceClient } = await import('../utils/service-client');
      client = getServiceClient();
      console.log('[DEBUG] Using service client in server context for updateQueueItem');
    } else {
      // In client context, use the regular client with user authentication
      client = getSupabaseClient();
      console.log('[DEBUG] Using regular client in client context for updateQueueItem');
    }

    if (!client) {
      console.error('[DEBUG] Failed to create Supabase client');
      return null;
    }

    // Prepare the update object
    const updateData = {
      ...updates,
      // If filename is being updated but originalFilename isn't, set originalFilename to filename
      originalFilename: updates.originalFilename || (updates.filename ? updates.filename : undefined),
      updated_at: new Date().toISOString()
    }

    // Convert to snake_case for Supabase
    const snakeCaseUpdates = camelToSnake(updateData)

    // Update the document
    console.log('[DEBUG] Updating document:', id);
    let query = client
      .from('documents')
      .update(snakeCaseUpdates)
      .eq('id', id);

    // Only add user_id filter in client context
    if (!isServer && user.id) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.select().single();

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
