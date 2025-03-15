import { useState, useCallback, useEffect } from 'react';
import type { ProcessingStatus, OCRResult } from '@/types';
import * as apiService from '@/lib/client/api-service';
import { serverStorage } from '@/lib/client/server-storage-service';

interface UseFileProcessingOptions {
  onComplete?: (results: OCRResult[]) => void;
  onError?: (error: Error) => void;
  pollInterval?: number;
}

interface UseFileProcessingReturn {
  uploadFile: (file: File) => Promise<void>;
  cancelProcessing: () => Promise<void>;
  status: ProcessingStatus | null;
  results: OCRResult[];
  isProcessing: boolean;
  error: Error | null;
  progress: number;
}

export function useFileProcessing(options: UseFileProcessingOptions = {}): UseFileProcessingReturn {
  const { onComplete, onError, pollInterval = 1000 } = options;
  
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [results, setResults] = useState<OCRResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Upload a file for processing
  const uploadFile = useCallback(async (file: File) => {
    try {
      setIsProcessing(true);
      setError(null);
      setResults([]);
      setProgress(0);
      
      // Upload the file to the server
      const { id, status: initialStatus } = await apiService.uploadFile(file);
      
      setDocumentId(id);
      setStatus(initialStatus);
      
      // Start polling for status updates
      const finalStatus = await apiService.pollProcessingStatus(
        id,
        (updatedStatus) => {
          setStatus(updatedStatus);
          setProgress(updatedStatus.progress || 0);
        },
        pollInterval
      );
      
      // If processing completed successfully, get the results
      if (finalStatus.status === 'completed') {
        const results = await serverStorage.getResults(id);
        setResults(results);
        
        if (onComplete) {
          onComplete(results);
        }
      } else if (finalStatus.status === 'error' || finalStatus.status === 'failed') {
        throw new Error(finalStatus.error || 'Processing failed');
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
      
      if (onError) {
        onError(error instanceof Error ? error : new Error('Unknown error'));
      }
    } finally {
      setIsProcessing(false);
    }
  }, [onComplete, onError, pollInterval]);
  
  // Cancel processing
  const cancelProcessing = useCallback(async () => {
    if (!documentId) return;
    
    try {
      await apiService.cancelProcessing(documentId);
      
      // Update status
      const updatedStatus = await serverStorage.getStatus(documentId);
      if (updatedStatus) {
        setStatus(updatedStatus);
      }
    } catch (error) {
      console.error('Error cancelling processing:', error);
      setError(error instanceof Error ? error : new Error('Failed to cancel processing'));
      
      if (onError) {
        onError(error instanceof Error ? error : new Error('Failed to cancel processing'));
      }
    }
  }, [documentId, onError]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      // No cleanup needed for server-based processing
    };
  }, []);
  
  return {
    uploadFile,
    cancelProcessing,
    status,
    results,
    isProcessing,
    error,
    progress
  };
} 