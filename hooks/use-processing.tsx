'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ProcessingStatus, OCRResult } from '@/types';
import { useServerApi } from './use-server-api';
import { useToast } from './use-toast';

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
  
  const {
    getQueue,
    clearQueue,
    getQueueItem,
    removeQueueItem,
    cancelProcessing,
    getResults,
    processFile,
  } = useServerApi({
    onError: (error) => {
      setError(error);
      if (options?.onError) {
        options.onError(error);
      }
      toast({
        title: 'Processing Error',
        description: error.message,
        variant: 'destructive',
      });
    },
    debounceMs: 500 // Add debounce to API calls
  });
  
  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);
  
  // Load queue on mount, but only once
  useEffect(() => {
    if (isInitialLoadDone.current) return;
    
    const loadQueue = async () => {
      setIsLoading(true);
      try {
        const queue = await getQueue();
        setActiveJobs(queue);
        
        // Check for processing jobs
        const processingJobs = queue.filter(job => job.status === 'processing');
        setIsProcessing(processingJobs.length > 0);
        isInitialLoadDone.current = true;
      } catch (error) {
        console.error('Failed to load queue:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadQueue();
  }, [getQueue]);
  
  // Poll for updates on active jobs
  useEffect(() => {
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    if (activeJobs.length === 0) return;
    
    const pollingInterval = options?.pollingInterval || 2000; // Default to 2 seconds
    const processingJobs = activeJobs.filter(job => job.status === 'processing');
    
    if (processingJobs.length === 0) return;
    
    // Set up new polling interval
    pollingIntervalRef.current = setInterval(async () => {
      let stillProcessing = false;
      
      for (const job of processingJobs) {
        try {
          const updatedJob = await getQueueItem(job.id);
          
          // Update job in active jobs
          setActiveJobs(prev => 
            prev.map(j => j.id === updatedJob.id ? updatedJob : j)
          );
          
          // Notify of status change
          if (options?.onStatusChange) {
            options.onStatusChange(updatedJob);
          }
          
          // If job is completed, load results
          if (updatedJob.status === 'completed' && !results.has(updatedJob.id)) {
            try {
              const jobResults = await getResults(updatedJob.id);
              
              // Update results
              setResults(prev => {
                const newResults = new Map(prev);
                newResults.set(updatedJob.id, jobResults);
                return newResults;
              });
              
              // Notify of completion
              if (options?.onComplete) {
                options.onComplete(jobResults);
              }
            } catch (error) {
              console.error(`Failed to load results for job ${updatedJob.id}:`, error);
            }
          }
          
          // Check if this job is still processing
          if (updatedJob.status === 'processing') {
            stillProcessing = true;
          }
        } catch (error) {
          console.error(`Failed to update job ${job.id}:`, error);
        }
      }
      
      // Update processing state
      setIsProcessing(stillProcessing);
      
      // If no jobs are still processing, clear the interval
      if (!stillProcessing && pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }, pollingInterval);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [activeJobs, getQueueItem, getResults, options, results]);
  
  // Process files
  const processFiles = useCallback(async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newJobs: ProcessingStatus[] = [];
      
      for (const file of files) {
        const { status } = await processFile(file);
        newJobs.push(status);
      }
      
      // Update active jobs
      setActiveJobs(prev => [...newJobs, ...prev]);
      setIsProcessing(true);
      
      return newJobs.map(job => job.id);
    } catch (error: any) {
      setError(error instanceof Error ? error : new Error(error?.message || 'Unknown error'));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [processFile]);
  
  // Cancel processing
  const cancelJob = useCallback(async (id: string) => {
    try {
      await cancelProcessing(id);
      
      // Update job in active jobs
      setActiveJobs(prev => 
        prev.map(job => 
          job.id === id 
            ? { ...job, status: 'cancelled' } 
            : job
        )
      );
      
      return true;
    } catch (error) {
      console.error(`Failed to cancel job ${id}:`, error);
      return false;
    }
  }, [cancelProcessing]);
  
  // Remove job
  const removeJob = useCallback(async (id: string) => {
    try {
      await removeQueueItem(id);
      
      // Remove job from active jobs
      setActiveJobs(prev => prev.filter(job => job.id !== id));
      
      // Remove results
      setResults(prev => {
        const newResults = new Map(prev);
        newResults.delete(id);
        return newResults;
      });
      
      return true;
    } catch (error) {
      console.error(`Failed to remove job ${id}:`, error);
      return false;
    }
  }, [removeQueueItem]);
  
  // Clear all jobs
  const clearJobs = useCallback(async () => {
    try {
      await clearQueue();
      
      // Clear active jobs and results
      setActiveJobs([]);
      setResults(new Map());
      setIsProcessing(false);
      
      return true;
    } catch (error) {
      console.error('Failed to clear jobs:', error);
      return false;
    }
  }, [clearQueue]);
  
  // Get results for a job
  const getJobResults = useCallback(async (id: string) => {
    // Check if we already have results
    if (results.has(id)) {
      return results.get(id) || [];
    }
    
    try {
      const jobResults = await getResults(id);
      
      // Update results
      setResults(prev => {
        const newResults = new Map(prev);
        newResults.set(id, jobResults);
        return newResults;
      });
      
      return jobResults;
    } catch (error) {
      console.error(`Failed to get results for job ${id}:`, error);
      return [];
    }
  }, [getResults, results]);
  
  return {
    activeJobs,
    results,
    isProcessing,
    isLoading,
    error,
    processFiles,
    cancelJob,
    removeJob,
    clearJobs,
    getJobResults,
  };
} 