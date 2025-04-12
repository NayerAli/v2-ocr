"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProcessingSettings } from '@/types/settings'

interface UseServerSettingsResult {
  processingSettings: ProcessingSettings | null
  isLoading: boolean
  error: string | null
  refreshSettings: () => Promise<void>
}

// Default processing settings as fallback
const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
}

/**
 * Hook to fetch server-side settings
 */
export function useServerSettings(): UseServerSettingsResult {
  const [processingSettings, setProcessingSettings] = useState<ProcessingSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use a ref to track if we've already fetched settings
  const hasFetchedRef = useRef(false)
  // Use a ref to track the last fetch time
  const lastFetchTimeRef = useRef(0)
  // Cache TTL in milliseconds (5 minutes)
  const CACHE_TTL = 5 * 60 * 1000

  // Use a ref to track if a fetch is in progress
  const isFetchingRef = useRef(false)

  const fetchProcessingSettings = useCallback(async (force = false) => {
    // Skip if already fetching (using ref to avoid stale state issues)
    if (isFetchingRef.current) {
      return
    }

    // Skip if we've already fetched and it's not forced and cache is still valid
    const now = Date.now()
    if (!force && hasFetchedRef.current && processingSettings && (now - lastFetchTimeRef.current < CACHE_TTL)) {
      return
    }

    try {
      isFetchingRef.current = true
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/settings/processing')

      if (!response.ok) {
        throw new Error(`Failed to fetch processing settings: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.settings) {
        setProcessingSettings(data.settings)
        hasFetchedRef.current = true
        lastFetchTimeRef.current = now
      } else if (data.error) {
        // If there's an error but default settings are provided
        setProcessingSettings(DEFAULT_PROCESSING_SETTINGS)
        setError(data.error)
      } else {
        // Fallback to default settings
        setProcessingSettings(DEFAULT_PROCESSING_SETTINGS)
      }
    } catch (err) {
      console.error('Error fetching server settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch settings')
      // Use default settings on error
      setProcessingSettings(DEFAULT_PROCESSING_SETTINGS)
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [isLoading, processingSettings])

  useEffect(() => {
    // Force initial fetch only once
    fetchProcessingSettings(true)

    // No polling interval - we'll only refresh when explicitly requested
    // This avoids unnecessary API calls
    return () => {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    processingSettings: processingSettings || DEFAULT_PROCESSING_SETTINGS,
    isLoading,
    error,
    refreshSettings: async () => {
      await fetchProcessingSettings(true)
    }
  }
}
