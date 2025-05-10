// Results-related database operations

import { mapToOCRResult } from '../utils/mappers'
import { getSupabaseClient, isSupabaseConfigured } from '../utils/config'
import { getContextClient, isServerContext } from '../utils/service-client'
import { getUser } from '../../auth'
import { infoLog } from '../../log'
import type { OCRResult } from '@/types'

/**
 * Get OCR results for a document
 */
export async function getResults(documentId: string): Promise<OCRResult[]> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot get results.')
    return []
  }

  // Get the appropriate client based on context
  const isServer = isServerContext();
  let client;

  if (isServer) {
    // In server context, use the service client to bypass RLS
    client = getContextClient(getSupabaseClient());
    infoLog('Using service client for getting OCR results in server context');
  } else {
    // In client context, use the regular client with user authentication
    client = getSupabaseClient();
  }

  // Get the current user (only needed in client context)
  let userId = null;
  if (!isServer) {
    const user = await getUser();
    userId = user?.id;
  }

  // Build the query
  let query = client
    .from('ocr_results')
    .select('*')
    .eq('document_id', documentId);

  // If in client context and user is authenticated, filter by user_id
  if (!isServer && userId) {
    query = query.eq('user_id', userId);
  }

  // Order by page number
  query = query.order('page_number', { ascending: true });

  // Execute the query
  const { data, error } = await query;

  if (error) {
    console.error('Error fetching results:', error);
    return [];
  }

  const results = data.map(mapToOCRResult);
  return results;
}

/**
 * Save OCR results for a document
 */
export async function saveResults(documentId: string, results: OCRResult[]): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error('Supabase not configured. Cannot save results.')
    return
  }

  // Skip empty results
  if (!results || results.length === 0) {
    console.warn('No results to save for document:', documentId);
    return;
  }

  // Get the appropriate client based on context
  const client = isServerContext()
    ? getContextClient(getSupabaseClient())
    : getSupabaseClient();

  if (isServerContext()) {
    infoLog('Using service client for saving OCR results in server context');
  }

  // First, try to get the document from the documents table
  const { data: document, error: documentError } = await client
    .from('documents')
    .select('id, user_id')
    .eq('id', documentId)
    .single()

  let documentData = document;

  if (documentError || !documentData) {
    console.error('Error: Document not found on first attempt. Retrying with delay...', documentError)
    console.log('Attempting to save results for document ID:', documentId)

    // Wait a short time and try again - this helps with race conditions
    await new Promise(resolve => setTimeout(resolve, 500))

    // Second attempt to get the document
    const { data: retryDocument, error: retryError } = await client
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .single()

    if (retryError || !retryDocument) {
      console.error('Error: Document still not found after retry. Cannot save results.', retryError)
      // Instead of returning, we'll continue with the user ID from the results if available
    } else {
      // Use the retry document if found
      documentData = retryDocument;
    }
  }

  // Get the current user
  const user = await getUser()

  // Try to get userId from multiple sources with fallbacks
  let userId = null

  // First priority: user from auth
  if (user) {
    userId = user.id
  }
  // Second priority: document user_id
  else if (documentData && documentData.user_id) {
    userId = documentData.user_id
  }
  // Third priority: first result's user_id
  else if (results.length > 0) {
    userId = results[0].user_id || (results[0] as any).userId
  }

  // If we still don't have a userId, log error but continue
  if (!userId) {
    console.error('Warning: No user ID found for results. This may cause issues with data retrieval.')
  }

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
      imageUrl, // camelCase version
      ...rest
    } = result;

    // We don't need to extract userId since we're using the validated userId from above

    // Remove any properties that don't match the database schema
    // This prevents errors like "Could not find the 'userId' column"
    const cleanedRest = { ...rest };
    if ('userId' in cleanedRest) delete cleanedRest.userId;

    // Ensure text is never null or undefined
    const resultText = result.text !== null && result.text !== undefined ? result.text : '';
    console.log(`Saving OCR result for document ${documentId || result.document_id}, page ${pageNumber || result.page_number || 1}, text length: ${resultText.length}`);

    // Add more debugging for empty text
    if (resultText.length === 0) {
      console.warn(`WARNING: Empty text for document ${documentId || result.document_id}, page ${pageNumber || result.page_number || 1}`);
    }

    // Handle both camelCase and snake_case versions of fields
    const preparedResult = {
      ...cleanedRest, // Include remaining properties (cleaned)
      document_id: documentId || result.document_id || documentId, // Use the document ID from the result or parameter
      id: result.id || crypto.randomUUID(),
      user_id: userId, // Always use the validated userId from above
      text: resultText, // Use the validated text
      confidence: result.confidence || 0,
      language: result.language || 'en',
      processing_time: processingTime || result.processing_time || 0,
      page_number: pageNumber || result.page_number || 1,
      total_pages: totalPages || result.total_pages || 1,
      storage_path: storagePath || result.storage_path || null,
      // Handle both imageUrl (camelCase) and image_url (snake_case)
      image_url: imageUrl || result.image_url || null,
      bounding_box: boundingBox || result.bounding_box || null,
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

        const { data, error } = await client
          .from('ocr_results')
          .upsert(batch, { onConflict: 'document_id,page_number,user_id' });

        if (error) {
          console.error(`Error saving batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}:`, error);
          // Continue with next batch instead of failing the entire operation
          continue;
        }
        
        // Log successful save
        console.log(`Successfully saved batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}, affected rows:`, data ? data.length : 'unknown');
      }
    } else {
      // For smaller result sets, upsert all at once
      const { data, error } = await client
        .from('ocr_results')
        .upsert(supabaseResults, { onConflict: 'document_id,page_number,user_id' });

      if (error) {
        console.error('Error saving results:', error);
        return;
      }
      
      // Log successful save with count
      console.log('Successfully saved result for documentId:', documentId, 'userId:', userId, 'affected rows:', data ? data.length : 'unknown');
    }
  } catch (err) {
    console.error('Exception saving results:', err);
    return;
  }
}
