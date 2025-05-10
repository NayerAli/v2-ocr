import { createClient } from '@/utils/supabase/server-wrapper';
import { ProcessingStatus } from '@/types';
import { processDocumentNow } from './document-processor';

/**
 * Retry processing a document from the server-side
 * This is useful for failed documents or when manually triggering reprocessing
 */
export async function retryDocumentFromServer(documentId: string): Promise<ProcessingStatus> {
  const supabase = createClient();
  
  // First, update the document status to 'pending'
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
    .select()
    .single();
  
  if (error || !data) {
    throw new Error(`Failed to update document status: ${error?.message || 'Unknown error'}`);
  }
  
  // Process the document
  return processDocumentNow(documentId);
} 