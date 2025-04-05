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

  const fetchProcessingSettings = useCallback(async (force = false) => {
    console.log('fetchProcessingSettings called, force =', force)

    // Skip if already loading
    if (isLoading) {
      console.log('Already loading, skipping fetch')
      return
    }

    // Skip if we've already fetched and it's not forced and cache is still valid
    const now = Date.now()
    if (!force && hasFetchedRef.current && processingSettings && (now - lastFetchTimeRef.current < CACHE_TTL)) {
      console.log('Using cached settings, skipping fetch')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      console.log('Client: Fetching processing settings from API')
      const response = await fetch('/api/settings/processing')

      if (!response.ok) {
        throw new Error(`Failed to fetch processing settings: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Client: Received response from API:', data)

      if (data.settings) {
        console.log('Client: Using settings from API response:', data.settings)
        setProcessingSettings(data.settings)
        hasFetchedRef.current = true
        lastFetchTimeRef.current = now
      } else if (data.error) {
        // If there's an error but default settings are provided
        console.log('Client: Error in API response, using default settings:', data.error)
        setProcessingSettings(DEFAULT_PROCESSING_SETTINGS)
        setError(data.error)
      } else {
        // Fallback to default settings
        console.log('Client: No settings in API response, using default settings')
        setProcessingSettings(DEFAULT_PROCESSING_SETTINGS)
      }
    } catch (err) {
      console.error('Error fetching server settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch settings')
      // Use default settings on error
      setProcessingSettings(DEFAULT_PROCESSING_SETTINGS)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, processingSettings])

  useEffect(() => {
    console.log('Initial fetch of processing settings')
    fetchProcessingSettings(true) // Force initial fetch

    // Set up a polling interval (every 30 seconds)
    const intervalId = setInterval(() => {
      console.log('Polling for processing settings')
      fetchProcessingSettings()
    }, 30000)

    return () => {
      console.log('Clearing processing settings interval')
      clearInterval(intervalId)
    }
  }, [fetchProcessingSettings])

  return {
    processingSettings: processingSettings || DEFAULT_PROCESSING_SETTINGS,
    isLoading,
    error,
    refreshSettings: async () => {
      console.log('Client: Forcing refresh of processing settings')
      await fetchProcessingSettings(true)
      console.log('Client: Processing settings refreshed')
    }
  }
}
