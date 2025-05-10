import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toSnakeCase, toCamelCase } from '@/utils/supabase/query-helpers'
import type { OCRResult } from '@/types'

interface UseOCRResultsOptions {
  documentId?: string
  onError?: (error: Error) => void
}

/**
 * Hook to fetch OCR results for a document with proper field name handling
 */
export function useOCRResults({ documentId, onError }: UseOCRResultsOptions = {}) {
  const [results, setResults] = useState<OCRResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!documentId) return

    async function fetchResults() {
      setIsLoading(true)
      setError(null)

      try {
        const supabase = createClient()
        
        // Use snake_case for query parameters
        const { data, error: queryError } = await supabase
          .from('ocr_results')
          .select('*')
          .eq('document_id', documentId)
          
        if (queryError) throw new Error(queryError.message)
        
        // Convert results to camelCase for client usage
        const standardizedResults = data ? toCamelCase<OCRResult[]>(data) : []
        
        // Sort by page number
        const sortedResults = standardizedResults.sort((a, b) => 
          (a.pageNumber || 0) - (b.pageNumber || 0)
        )
        
        setResults(sortedResults)
      } catch (err) {
        console.error('Error fetching OCR results:', err)
        const error = err instanceof Error ? err : new Error('Failed to fetch OCR results')
        setError(error)
        if (onError) onError(error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()
  }, [documentId, onError])

  return {
    results,
    isLoading,
    error,
    isEmpty: !isLoading && results.length === 0
  }
}

/**
 * Save OCR results for a document with proper field name handling
 */
export async function saveOCRResult(result: OCRResult): Promise<boolean> {
  try {
    const supabase = createClient()
    
    // Ensure we have document_id instead of documentId
    const snakeCaseData = toSnakeCase(result)
    
    const { error } = await supabase
      .from('ocr_results')
      .insert(snakeCaseData)
      
    return !error
  } catch (err) {
    console.error('Error saving OCR result:', err)
    return false
  }
}

/**
 * Update an OCR result with proper field name handling
 */
export async function updateOCRResult(result: OCRResult): Promise<boolean> {
  if (!result.id) return false
  
  try {
    const supabase = createClient()
    
    // Ensure we have document_id instead of documentId
    const snakeCaseData = toSnakeCase(result)
    
    const { error } = await supabase
      .from('ocr_results')
      .update(snakeCaseData)
      .eq('id', result.id)
      
    return !error
  } catch (err) {
    console.error('Error updating OCR result:', err)
    return false
  }
} 