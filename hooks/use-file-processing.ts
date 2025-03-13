import { useState, useCallback, useEffect } from 'react';
import type { ProcessingStatus, OCRResult } from '@/types';
import * as apiService from '@/lib/client/api-service';

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
      apiService.pollProcessingStatus(
        id,
        (updatedStatus) => {
          setStatus(updatedStatus);
          setProgress(updatedStatus.progress || 0);
          
          // If processing is complete, get the results
          if (updatedStatus.status === 'completed') {
            apiService.getResults(id)
              .then((results) => {
                setResults(results);
                setIsProcessing(false);
                onComplete?.(results);
              })
              .catch((error) => {
                setError(error);
                setIsProcessing(false);
                onError?.(error);
              });
          } else if (updatedStatus.status === 'error' || updatedStatus.status === 'cancelled' || updatedStatus.status === 'failed') {
            setIsProcessing(false);
            if ((updatedStatus.status === 'error' || updatedStatus.status === 'failed') && updatedStatus.error) {
              const error = new Error(updatedStatus.error);
              setError(error);
              onError?.(error);
            }
          }
        },
        pollInterval
      ).catch((error) => {
        setError(error);
        setIsProcessing(false);
        onError?.(error);
      });
    } catch (error: any) {
      setError(error);
      setIsProcessing(false);
      onError?.(error);
    }
  }, [onComplete, onError, pollInterval]);
  
  // Cancel processing
  const cancelProcessing = useCallback(async () => {
    if (documentId && isProcessing) {
      try {
        await apiService.cancelProcessing(documentId);
        setIsProcessing(false);
      } catch (error: any) {
        setError(error);
        onError?.(error);
      }
    }
  }, [documentId, isProcessing, onError]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (documentId && isProcessing) {
        apiService.cancelProcessing(documentId).catch(console.error);
      }
    };
  }, [documentId, isProcessing]);
  
  return {
    uploadFile,
    cancelProcessing,
    status,
    results,
    isProcessing,
    error,
    progress,
  };
} 