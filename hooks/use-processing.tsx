'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ProcessingStatus, OCRResult } from '@/types';
import { useToast } from './use-toast';
import { serverStorage } from '@/lib/client/server-storage-service';
import * as apiService from '@/lib/client/api-service';

interface UseProcessingOptions {
  pollingInterval?: number;
  onStatusChange?: (status: ProcessingStatus) => void;
  onComplete?: (results: OCRResult[]) => void;
  onError?: (error: Error) => void;
}

export function useProcessing(options?: UseProcessingOptions) {
  const { toast } = useToast();
  const [activeJobs, setActiveJobs] = useState<ProcessingStatus[]>([]);
  const [results, setResults] = useState<Map<string, OCRResult[]>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadDone = useRef(false);

  // Load the queue from the server
  const loadQueue = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      
      // Get the queue from the server
      const queue = await serverStorage.getQueue();
      
      // Update active jobs
      setActiveJobs(queue);
      
      // Load results for completed jobs
      const completedJobs = queue.filter(job => job.status === 'completed');
      
      // Load results for each completed job that we don't already have
      for (const job of completedJobs) {
        if (!results.has(job.id)) {
          try {
            const jobResults = await serverStorage.getResults(job.id);
            setResults(prev => new Map(prev).set(job.id, jobResults));
            
            if (options?.onComplete) {
              options.onComplete(jobResults);
            }
          } catch (err) {
            console.error(`Error loading results for job ${job.id}:`, err);
          }
        }
      }
      
      // Update processing state
      setIsProcessing(queue.some(job => job.status === 'processing' || job.status === 'queued'));
      
      // Call onStatusChange for each job
      if (options?.onStatusChange) {
        queue.forEach(job => options.onStatusChange?.(job));
      }
      
      isInitialLoadDone.current = true;
    } catch (err) {
      console.error('Error loading queue:', err);
      setError(err instanceof Error ? err : new Error('Failed to load queue'));
      
      if (options?.onError) {
        options.onError(err instanceof Error ? err : new Error('Failed to load queue'));
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [options, results]);

  // Start polling for updates
  useEffect(() => {
    // Initial load
    loadQueue(true);
    
    // Setup polling
    const pollingInterval = options?.pollingInterval || 3000;
    pollingIntervalRef.current = setInterval(() => {
      loadQueue(false);
    }, pollingInterval);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [loadQueue, options?.pollingInterval]);

  // Process a file
  const handleProcessFile = useCallback(async (file: File) => {
    try {
      setIsProcessing(true);
      
      // Process the file
      const { id, status } = await apiService.uploadFile(file);
      
      // Add to active jobs
      setActiveJobs(prev => [...prev, status]);
      
      // Start polling for updates
      loadQueue(false);
      
      return id;
    } catch (err) {
      console.error('Error processing file:', err);
      setError(err instanceof Error ? err : new Error('Failed to process file'));
      
      if (options?.onError) {
        options.onError(err instanceof Error ? err : new Error('Failed to process file'));
      }
      
      throw err;
    }
  }, [loadQueue, options]);

  // Cancel processing for a job
  const handleCancelProcessing = useCallback(async (id: string) => {
    try {
      // Cancel the job
      await apiService.cancelProcessing(id);
      
      // Update the job status
      const updatedJob = await serverStorage.getStatus(id);
      
      if (updatedJob) {
        setActiveJobs(prev => 
          prev.map(job => job.id === id ? updatedJob : job)
        );
        
        if (options?.onStatusChange) {
          options.onStatusChange(updatedJob);
        }
      }
      
      return true;
    } catch (err) {
      console.error('Error cancelling job:', err);
      setError(err instanceof Error ? err : new Error('Failed to cancel job'));
      
      if (options?.onError) {
        options.onError(err instanceof Error ? err : new Error('Failed to cancel job'));
      }
      
      return false;
    }
  }, [options]);

  // Get results for a job
  const handleGetResults = useCallback(async (id: string) => {
    try {
      // Check if we already have the results
      if (results.has(id)) {
        return results.get(id)!;
      }
      
      // Get the results from the server
      const jobResults = await serverStorage.getResults(id);
      
      // Update the results
      setResults(prev => new Map(prev).set(id, jobResults));
      
      return jobResults;
    } catch (err) {
      console.error('Error getting results:', err);
      setError(err instanceof Error ? err : new Error('Failed to get results'));
      
      if (options?.onError) {
        options.onError(err instanceof Error ? err : new Error('Failed to get results'));
      }
      
      throw err;
    }
  }, [options, results]);

  return {
    activeJobs,
    results,
    isProcessing,
    isLoading,
    error,
    processFile: handleProcessFile,
    cancelProcessing: handleCancelProcessing,
    getResults: handleGetResults,
    refreshQueue: loadQueue,
  };
} 