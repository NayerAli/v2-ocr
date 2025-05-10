import { createClient } from '@/utils/supabase/server-wrapper'
import { getServiceClient } from '@/lib/database/utils/service-client'
import { ProcessingStatus } from '@/types'
import { FileProcessor } from './file-processor'
import { createOCRProvider, createOCRProviderWithLatestSettings } from './providers'
import { createFallbackOCRProvider } from './providers/fallback-provider'
import { userSettingsService } from '@/lib/user-settings-service'
import { downloadFileFromStorage } from './storage-utils'
import { AzureRateLimiter } from './rate-limiter'
import { serverLog, serverError } from '@/lib/log'
import { serverAuthHelper } from '@/lib/server-auth-helper'

// Global rate limiter instance to be shared across all processing
const globalRateLimiter = new AzureRateLimiter()

/**
 * Initialize the processing environment
 * This ensures all necessary components are properly initialized
 */
export async function initializeProcessing() {
  const requestId = crypto.randomUUID().substring(0, 8)
  serverLog(requestId, `Initializing document processing environment`)

  try {
    // Initialize PDF.js
    const { initializePDFJS } = await import('@/lib/pdf-init')
    await initializePDFJS()
    serverLog(requestId, `PDF.js initialized successfully`)

    // Get default settings for processing
    const defaultSettings = {
      provider: 'google',
      apiKey: '',
      useSystemKey: true,
      language: 'ar'
    }

    const defaultProcessingSettings = {
      maxConcurrentJobs: 3,
      pagesPerChunk: 3,
      concurrentChunks: 3,
      retryAttempts: 2,
      retryDelay: 1000
    }

    // Create OCR provider with system key
    const ocrProvider = await createOCRProvider({
      ...defaultSettings,
      useSystemKey: true
    }, globalRateLimiter)

    // Create file processor
    const fileProcessor = new FileProcessor(defaultProcessingSettings, ocrProvider)
    serverLog(requestId, `Processing environment initialized successfully`)

    return {
      fileProcessor,
      ocrProvider,
      rateLimiter: globalRateLimiter
    }
  } catch (error) {
    serverError(requestId, `Error initializing processing environment: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * Process a document immediately after it's been uploaded
 * This is for server-side use only
 */
export async function processDocumentNow(documentId: string): Promise<ProcessingStatus> {
  const requestId = crypto.randomUUID().substring(0, 8)
  serverLog(requestId, `Starting document processing for document ID: ${documentId}`)

  // Use service client to bypass RLS policies
  const serviceClient = getServiceClient()
  if (!serviceClient) {
    serverError(requestId, `Failed to create service client`)
    throw new Error('Failed to create service client')
  }

  // Initialize the processing environment first
  serverLog(requestId, `Initializing processing environment`)
  await initializeProcessing()

  // Get the document from the database using service client
  serverLog(requestId, `Fetching document ${documentId} from database using service client`)
  const { data: document, error } = await serviceClient
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (error || !document) {
    const errorMsg = `Document not found: ${error?.message || 'Unknown error'}`
    serverError(requestId, errorMsg)
    throw new Error(errorMsg)
  }

  serverLog(requestId, `Found document: ${document.id}, filename: ${document.filename}, status: ${document.status}, type: ${document.file_type}, size: ${document.file_size}`)

  // If document is already in 'processing' state, it might be a duplicate request
  if (document.status === 'processing') {
    // Check if it's been processing for too long
    const processingStarted = document.processing_started_at ? new Date(document.processing_started_at) : null;
    if (processingStarted && (new Date().getTime() - processingStarted.getTime() > 10 * 60 * 1000)) {
      // It's been processing for more than 10 minutes, reset it
      serverLog(requestId, `Document has been stuck in processing for too long, resetting status`)
      const { error: resetError } = await serviceClient
        .from('documents')
        .update({
          status: 'pending',
          error: null,
          processing_started_at: null
        })
        .eq('id', documentId)

      if (resetError) {
        serverError(requestId, `Error resetting stuck document: ${resetError.message}`)
      }
    } else {
      // It's likely already being processed, log and continue
      serverLog(requestId, `Document is already in processing state, might be a duplicate request`)
    }
  }

  // Update status to 'processing'
  const processingStartedAt = new Date().toISOString()
  serverLog(requestId, `Updating document status to 'processing'`)

  const { error: updateError } = await serviceClient
    .from('documents')
    .update({
      status: 'processing',
      processing_started_at: processingStartedAt
    })
    .eq('id', documentId)

  if (updateError) {
    serverError(requestId, `Error updating document status: ${updateError.message}`)
  } else {
    serverLog(requestId, `Document status updated to 'processing'`)
  }

  try {
    // Store the user ID for use throughout processing
    const userId = document.user_id

    // Download the file from storage
    serverLog(requestId, `Downloading file from storage: ${document.storage_path}`)
    let file
    try {
      file = await downloadFileFromStorage(document.storage_path)
      serverLog(requestId, `File downloaded successfully: ${file.name}, size: ${file.size}, type: ${file.type}`)
    } catch (downloadError) {
      serverError(requestId, `Error downloading file: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`)
      throw downloadError
    }

    // Get user settings directly using the user ID (most reliable approach for server context)
    serverLog(requestId, `Getting OCR and processing settings for user ${userId}`)
    let ocrSettings, processingSettings
    try {
      // Tell userSettingsService we're in a server context
      userSettingsService.setServerContext(true)
      userSettingsService.setUserId(userId)

      // Always try to get settings directly by user ID first
      const directOcrSettings = await serverAuthHelper.getOCRSettingsById(userId)
      const directProcessingSettings = await serverAuthHelper.getProcessingSettingsById(userId)

      if (directOcrSettings && directProcessingSettings) {
        // Force useSystemKey to true in server context
        ocrSettings = {
          ...directOcrSettings,
          useSystemKey: true
        }
        processingSettings = directProcessingSettings
        serverLog(requestId, `Settings retrieved directly - OCR provider: ${ocrSettings.provider}, useSystemKey: ${ocrSettings.useSystemKey}`)
      } else {
        // This fallback should rarely be needed if serverAuthHelper is working correctly
        serverLog(requestId, `Couldn't retrieve settings directly, falling back to user settings service`)
        ocrSettings = await userSettingsService.getOCRSettings({ serverContext: true, forceRefresh: true })
        processingSettings = await userSettingsService.getProcessingSettings({ serverContext: true, forceRefresh: true })
        serverLog(requestId, `Settings retrieved from service - OCR provider: ${ocrSettings.provider}, useSystemKey: ${ocrSettings.useSystemKey}`)
      }
    } catch (settingsError) {
      serverError(requestId, `Error getting settings: ${settingsError instanceof Error ? settingsError.message : String(settingsError)}`)
      serverLog(requestId, `Using default settings as fallback`)
      // Use defaults if all else fails
      ocrSettings = {
        provider: 'google',
        apiKey: '',
        useSystemKey: true,
        language: 'ar'
      }
      processingSettings = {
        maxConcurrentJobs: 3,
        pagesPerChunk: 3,
        concurrentChunks: 3,
        retryAttempts: 2,
        retryDelay: 1000
      }
    }

    // Create OCR provider with consistent settings
    serverLog(requestId, `Creating OCR provider: ${ocrSettings.provider}`)
    let ocrProvider
    try {
      // Ensure useSystemKey is correctly set
      ocrSettings.useSystemKey = true

      ocrProvider = await createOCRProvider(ocrSettings, azureRateLimiter)
      serverLog(requestId, `OCR provider created successfully`)
    } catch (providerError) {
      serverError(requestId, `Error creating OCR provider: ${providerError instanceof Error ? providerError.message : String(providerError)}`)
      serverLog(requestId, `Using fallback OCR provider instead`)
      ocrProvider = createFallbackOCRProvider()
    }

    // Verify we have a valid provider
    if (!ocrProvider) {
      serverLog(requestId, `No OCR provider was created, using fallback provider`)
      ocrProvider = createFallbackOCRProvider()
    }

    // Create file processor
    serverLog(requestId, `Creating file processor`)
    const processor = new FileProcessor(processingSettings, ocrProvider)

    // Create processing status
    const status: ProcessingStatus = {
      id: document.id,
      user_id: userId, // Use snake_case for database compatibility
      filename: document.filename,
      status: 'processing',
      createdAt: new Date(document.created_at),
      updatedAt: new Date(document.updated_at),
      processingStartedAt: new Date(processingStartedAt),
      fileType: document.file_type,
      fileSize: document.file_size,
      storagePath: document.storage_path,
      file,
      totalPages: document.total_pages
    }

    // Process the file
    serverLog(requestId, `Starting file processing for ${document.filename}`)
    let results
    let processingSuccessful = false
    let processingErrorMessage = ''

    try {
      const abortController = new AbortController()
      results = await processor.processFile(status, abortController.signal)

      // Verify results were actually saved
      if (!results || results.length === 0) {
        throw new Error("No OCR results were generated during processing");
      }

      // Check if any results have errors
      const hasErrors = results.some(result => result.error);
      if (hasErrors) {
        const errorMessages = results
          .filter(result => result.error)
          .map(result => result.error)
          .join('; ');
        throw new Error(`OCR processing completed with errors: ${errorMessages}`);
      }

      serverLog(requestId, `File processing completed successfully with ${results.length} results`);
      processingSuccessful = true;
    } catch (processingError) {
      processingErrorMessage = processingError instanceof Error ? processingError.message : String(processingError);
      serverError(requestId, `Error processing file: ${processingErrorMessage}`);
      // Don't throw here, we'll handle the error by updating the document status
    }

    // Update document status based on processing outcome
    if (processingSuccessful) {
      // Update status to 'completed'
      serverLog(requestId, `Updating document status to 'completed'`);
      const processingCompletedAt = new Date().toISOString();
      const { data: updatedDoc, error: completeError } = await serviceClient
        .from('documents')
        .update({
          status: 'completed',
          processing_completed_at: processingCompletedAt,
          updated_at: new Date().toISOString(),
          error: null, // Clear any previous error
          // Ensure user_id is set to the document's user_id
          user_id: document.user_id || '2f4a9512-414a-47cc-a1d1-a110739085f8' // Fallback to test user ID if needed
        })
        .eq('id', documentId)
        .select()
        .single()

      if (completeError) {
        serverError(requestId, `Error updating document status to completed: ${completeError.message}`)
      } else {
        serverLog(requestId, `Document status updated to 'completed'`)
      }

      // Return the updated status
      serverLog(requestId, `Document processing completed successfully`)
      return {
        ...status,
        status: 'completed',
        processingCompletedAt: new Date(processingCompletedAt),
        results
      }
    } else {
      // Processing failed, update status to 'failed'
      serverLog(requestId, `Updating document status to 'failed' due to processing errors`)
      const { data: updatedDoc, error: failedError } = await serviceClient
        .from('documents')
        .update({
          status: 'failed',
          error: processingErrorMessage,
          updated_at: new Date().toISOString(),
          // Ensure user_id is set to the document's user_id
          user_id: document.user_id || '2f4a9512-414a-47cc-a1d1-a110739085f8' // Fallback to test user ID if needed
        })
        .eq('id', documentId)
        .select()
        .single()

      if (failedError) {
        serverError(requestId, `Error updating document status to failed: ${failedError.message}`)
      } else {
        serverLog(requestId, `Document status updated to 'failed'`)
      }

      // Return the updated status
      serverLog(requestId, `Document processing failed: ${processingErrorMessage}`)
      return {
        ...status,
        status: 'failed',
        error: processingErrorMessage,
        results: results || []
      }
    }
  } catch (error) {
    // Log the error
    const errorMessage = error instanceof Error ? error.message : String(error)
    serverError(requestId, `Error processing document ${documentId}: ${errorMessage}`, error)

    // Update status to 'failed'
    serverLog(requestId, `Updating document status to 'failed'`)
    const { data: updatedDoc, error: failedError } = await serviceClient
      .from('documents')
      .update({
        status: 'failed',
        error: errorMessage,
        updated_at: new Date().toISOString(),
        // Ensure user_id is set to the document's user_id
        user_id: document.user_id || '2f4a9512-414a-47cc-a1d1-a110739085f8' // Fallback to test user ID if needed
      })
      .eq('id', documentId)
      .select()
      .single()

    if (failedError) {
      serverError(requestId, `Error updating document status to failed: ${failedError.message}`)
    } else {
      serverLog(requestId, `Document status updated to 'failed'`)
    }

    // Return the updated status
    serverLog(requestId, `Document processing failed: ${errorMessage}`)
    return {
      id: document.id,
      user_id: document.user_id, // Use snake_case for database compatibility
      filename: document.filename,
      status: 'failed',
      createdAt: new Date(document.created_at),
      updatedAt: new Date(),
      processingStartedAt: new Date(processingStartedAt),
      fileType: document.file_type,
      fileSize: document.file_size,
      storagePath: document.storage_path,
      error: errorMessage
    }
  }
}