import { createClient } from '@/utils/supabase/client';
import { ProcessingStatus } from '@/types';
import { getUser } from '@/lib/auth';
import { triggerDocumentProcessing } from '@/utils/supabase/client-processor';

/**
 * Retry a document from any status (failed, error, cancelled, completed)
 * by resetting it to 'pending' and triggering processing
 */
export async function retryDocument(documentId: string): Promise<ProcessingStatus | null> {
  if (!documentId) {
    console.error('[DEBUG] No document ID provided for retry');
    return null;
  }

  console.log('[DEBUG] Retrying document:', documentId);

  try {
    // Get the current user
    const user = await getUser();

    if (!user) {
      console.error('[DEBUG] User not authenticated. Cannot retry document.');
      return null;
    }

    // Create Supabase client
    const supabase = createClient();

    // Update document status to 'pending'
    console.log('[DEBUG] Updating document status to pending');

    const { data, error } = await supabase
      .from('documents')
      .update({
        status: 'pending',
        error: null,
        current_page: null,
        processing_started_at: null,
        processing_completed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[DEBUG] Error updating document status:', error);
      return null;
    }

    // Map the database result to ProcessingStatus
    const status: ProcessingStatus = {
      id: data.id,
      user_id: data.user_id, // Use snake_case for database compatibility
      filename: data.filename,
      originalFilename: data.original_filename,
      status: data.status,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      processingStartedAt: data.processing_started_at ? new Date(data.processing_started_at) : undefined,
      processingCompletedAt: data.processing_completed_at ? new Date(data.processing_completed_at) : undefined,
      fileType: data.file_type,
      fileSize: data.file_size,
      currentPage: data.current_page,
      totalPages: data.total_pages,
      storagePath: data.storage_path,
      thumbnailPath: data.thumbnail_path,
      error: data.error
    };

    // Trigger processing through the API helper
    console.log('[DEBUG] Triggering document processing via API');
    await triggerDocumentProcessing(documentId);

    return status;
  } catch (error) {
    console.error('[DEBUG] Exception in retryDocument:', error);
    return null;
  }
}