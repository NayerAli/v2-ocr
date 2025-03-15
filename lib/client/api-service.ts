import type { ProcessingStatus, OCRResult } from '@/types';

/**
 * Upload a file for processing
 */
export async function uploadFile(file: File): Promise<{ id: string; status: ProcessingStatus }> {
  console.log('[Client] Starting file upload:', {
    name: file.name,
    type: file.type,
    size: file.size
  });

  const formData = new FormData();
  formData.append('file', file);
  
  console.log('[Client] Sending request to /api/process');
  const response = await fetch('/api/process', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[Client] Upload failed:', error);
    throw new Error(error.error || 'Failed to upload file');
  }
  
  const result = await response.json();
  console.log('[Client] Upload successful:', result);
  return result;
}

/**
 * Get the status of a processing job
 */
export async function getProcessingStatus(id: string): Promise<ProcessingStatus> {
  const response = await fetch(`/api/process/${id}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get processing status');
  }
  
  const data = await response.json();
  return data.status;
}

/**
 * Cancel a processing job
 */
export async function cancelProcessing(id: string): Promise<boolean> {
  const response = await fetch(`/api/process/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel processing');
  }
  
  const data = await response.json();
  return data.success;
}

/**
 * Get the results of a processing job
 */
export async function getResults(id: string): Promise<OCRResult[]> {
  const response = await fetch(`/api/results/${id}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get results');
  }
  
  const data = await response.json();
  return data.results;
}

/**
 * Poll for processing status until complete
 */
export async function pollProcessingStatus(
  id: string,
  onUpdate: (status: ProcessingStatus) => void,
  interval = 1000
): Promise<ProcessingStatus> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getProcessingStatus(id);
        onUpdate(status);
        
        if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled' || status.status === 'failed') {
          resolve(status);
        } else {
          setTimeout(poll, interval);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
} 