import { createClient as createClientBrowser } from '@/utils/supabase/client';

/**
 * Client-side helper to trigger document processing via API
 */
export async function triggerDocumentProcessing(documentId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/documents/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ documentId })
    });
    
    if (!response.ok) {
      console.error('[DEBUG] Error triggering processing:', await response.text());
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[DEBUG] Failed to call processing API:', error);
    return false;
  }
}

/**
 * Client-side helper to retry document processing
 */
export async function retryDocumentProcessing(documentId: string): Promise<boolean> {
  try {
    // Reset document status via API call
    const response = await fetch(`/api/documents/${documentId}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('[DEBUG] Error retrying document processing:', await response.text());
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[DEBUG] Failed to retry document processing:', error);
    return false;
  }
} 