// Results-related database operations

import { getUser } from '../../auth'
import type { OCRResult } from '@/types'
import { supabase, isSupabaseConfigured, mapToOCRResult, camelToSnake } from '../utils'

/**
 * Get OCR results for a document
 */
export async function getResults(documentId: string): Promise<OCRResult[]> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot get results.')
    return []
  }

  // Get the current user
  const user = await getUser()

  // Build the query
  let query = supabase
    .from('ocr_results')
    .select('*')
    .eq('document_id', documentId)

  // If user is authenticated, filter by user_id
  if (user) {
    query = query.eq('user_id', user.id)
  }

  // Order by page number
  query = query.order('page_number', { ascending: true })

  // Execute the query
  const { data, error } = await query

  if (error) {
    console.error('Error fetching results:', error)
    return []
  }

  const results = data.map(mapToOCRResult)
  return results
}

/**
 * Save OCR results for a document
 */
export async function saveResults(documentId: string, results: OCRResult[]): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot save results.')
    return
  }

  // First, verify that the document exists in the documents table
  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('id, user_id')
    .eq('id', documentId)
    .single()

  if (documentError || !document) {
    console.error('Error: Document not found. Cannot save results.', documentError)
    console.log('Attempting to save results for document ID:', documentId)
    return
  }

  // Get the current user
  const user = await getUser()
  const userId = user?.id || document.user_id || null

  // Prepare results for Supabase with required fields
  const supabaseResults = results.map(result => {
    const preparedResult = {
      ...result,
      document_id: documentId,
      id: result.id || crypto.randomUUID(),
      user_id: userId,
      text: result.text || '',
      confidence: result.confidence || 0,
      language: result.language || 'en',
      processing_time: result.processingTime || 0,
      page_number: result.pageNumber || 1,
      total_pages: result.totalPages || 1,
      image_url: result.imageUrl || null,
      bounding_box: result.boundingBox || null,
      error: result.error || null,
      provider: result.provider || 'unknown'
    }
    return preparedResult
  })

  // Add some debug logging
  console.log('Saving results for document:', { documentId, count: results.length })

  try {
    // Check if the result set is too large
    const MAX_BATCH_SIZE = 100; // Maximum number of records to insert at once

    if (supabaseResults.length > MAX_BATCH_SIZE) {
      console.log(`Large result set detected (${supabaseResults.length} records). Splitting into batches of ${MAX_BATCH_SIZE}.`);

      // Split into smaller batches
      for (let i = 0; i < supabaseResults.length; i += MAX_BATCH_SIZE) {
        const batch = supabaseResults.slice(i, i + MAX_BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(supabaseResults.length / MAX_BATCH_SIZE)} (${batch.length} records)`);

        const { error } = await supabase
          .from('ocr_results')
          .upsert(batch, { onConflict: ['document_id', 'page_number', 'user_id'] });

        if (error) {
          console.error(`Error saving batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}:`, error);
          // Continue with next batch instead of failing the entire operation
          continue;
        }
      }
    } else {
      // For smaller result sets, upsert all at once
      const { error } = await supabase
        .from('ocr_results')
        .upsert(supabaseResults, { onConflict: ['document_id', 'page_number', 'user_id'] });

      if (error) {
        console.error('Error saving results:', error);
        return;
      }
    }
  } catch (err) {
    console.error('Exception saving results:', err);
    return;
  }
}
