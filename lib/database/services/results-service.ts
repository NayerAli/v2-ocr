// Results-related database operations

import { getUser } from '../../auth'
import { getUUID } from '@/lib/uuid'
import type { OCRResult } from '@/types'
// camelToSnake is imported but not used in this file
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Extract camelCase properties that should be snake_case in the database
    const {
      documentId,
      processingTime,
      pageNumber,
      totalPages,
      storagePath,
      boundingBox,
      imageUrl, // Add imageUrl to the list of properties to convert to snake_case
      ...rest
    } = result;

    const preparedResult = {
      ...rest, // Include remaining properties
      document_id: documentId, // Always use the parameter value for document_id
      id: result.id || getUUID(),
      user_id: userId,
      text: result.text || '',
      confidence: result.confidence || 0,
      language: result.language || 'en',
      processing_time: processingTime || (result as unknown as Record<string, unknown>).processing_time as number || result.processingTime || 0,
      page_number: pageNumber || (result as unknown as Record<string, unknown>).page_number as number || result.pageNumber || 1,
      total_pages: totalPages || (result as unknown as Record<string, unknown>).total_pages as number || result.totalPages || 1,
      storage_path: storagePath || null,
      image_url: imageUrl || null, // Add image_url field with snake_case
      bounding_box: boundingBox || (result as unknown as Record<string, unknown>).bounding_box as string || result.boundingBox || null,
      error: result.error || null,
      provider: (result as unknown as Record<string, unknown>).provider as string || 'unknown'
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
          .upsert(batch, { onConflict: 'document_id,page_number,user_id' });

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
        .upsert(supabaseResults, { onConflict: 'document_id,page_number,user_id' });

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
