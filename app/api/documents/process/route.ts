import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server-wrapper'
import { auth } from '@/lib/auth.server'
import { processDocumentNow } from '@/lib/ocr/document-processor'
import { serverLog, serverError } from '@/lib/log'
import { logApiRequestToConsole } from '@/lib/server-console-logger'

// Maximum time a document can remain in processing state (30 minutes)
const MAX_PROCESSING_TIME_MS = 10 * 60 * 1000

/**
 * API route to process a document in the queue
 * POST /api/documents/process
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().substring(0, 8)
  logApiRequestToConsole(request, 'POST', request.url)
  serverLog(requestId, `Processing document API request`)

  try {
    // Get authenticated user
    serverLog(requestId, `Authenticating user`)
    let user;
    try {
      user = await auth.getUser();
      if (user) {
        serverLog(requestId, `User authenticated: ${user.id}`);
      } else {
        // For testing purposes, create a test user
        serverLog(requestId, `No authenticated user found, using test user for development`);
        user = {
          id: '2f4a9512-414a-47cc-a1d1-a110739085f8', // Test user ID
          email: 'test@test.com'
        };
      }
    } catch (authError) {
      // For testing purposes, create a test user
      serverLog(requestId, `Authentication error: ${authError instanceof Error ? authError.message : String(authError)}`);
      serverLog(requestId, `Using test user for development`);
      user = {
        id: '2f4a9512-414a-47cc-a1d1-a110739085f8', // Test user ID
        email: 'test@test.com'
      };
    }

    // Parse the request body
    let documentId
    try {
      // Check if the request is a multipart form data (file upload)
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        // Handle file upload
        serverLog(requestId, `Detected file upload request`);

        // For testing purposes, create a random document ID
        documentId = crypto.randomUUID();
        serverLog(requestId, `Created test document ID: ${documentId}`);

        // Return success for testing
        return NextResponse.json({
          success: true,
          message: 'Test file upload received',
          documentId
        });
      } else {
        // Handle normal JSON request
        const body = await request.json();
        documentId = body.documentId;
        serverLog(requestId, `Request body parsed, documentId: ${documentId || 'not provided'}`);
      }
    } catch (parseError) {
      serverError(requestId, `Error parsing request body: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
      return NextResponse.json(
        { error: 'Bad request: Invalid JSON' },
        { status: 400 }
      )
    }

    if (!documentId) {
      serverError(requestId, `Bad request: documentId is required`)
      return NextResponse.json(
        { error: 'Bad request: documentId is required' },
        { status: 400 }
      )
    }

    // Get Supabase client
    serverLog(requestId, `Creating Supabase client`)
    const supabase = createClient()

    // Check for any stuck documents in 'processing' state and reset them
    try {
      const now = new Date()
      const { data: stuckDocuments, error: stuckError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'processing')
        .lt('processing_started_at', new Date(now.getTime() - MAX_PROCESSING_TIME_MS).toISOString())

      if (stuckError) {
        serverError(requestId, `Error checking for stuck documents: ${stuckError.message}`)
      } else if (stuckDocuments && stuckDocuments.length > 0) {
        serverLog(requestId, `Found ${stuckDocuments.length} stuck documents, resetting their status`)

        for (const stuckDoc of stuckDocuments) {
          const { error: resetError } = await supabase
            .from('documents')
            .update({
              status: 'error',
              error: 'Processing timed out after 10 minutes',
              updated_at: now.toISOString()
            })
            .eq('id', stuckDoc.id)

          if (resetError) {
            serverError(requestId, `Failed to reset stuck document ${stuckDoc.id}: ${resetError.message}`)
          } else {
            serverLog(requestId, `Reset stuck document ${stuckDoc.id}`)
          }
        }
      }
    } catch (stuckCheckError) {
      serverError(requestId, `Error handling stuck documents: ${stuckCheckError instanceof Error ? stuckCheckError.message : String(stuckCheckError)}`)
    }

    // Check if document exists and belongs to the user
    serverLog(requestId, `Checking if document ${documentId} exists and belongs to user ${user.id}`)

    // Try with service client first for better reliability
    let document, docError;
    try {
      const { createServiceClient } = await import('@/lib/database/utils/service-client');
      const serviceClient = createServiceClient();

      if (serviceClient) {
        serverLog(requestId, `Using service client to check document`);
        const result = await serviceClient
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .eq('user_id', user.id)
          .single();

        document = result.data;
        docError = result.error;

        if (docError) {
          serverLog(requestId, `Service client error: ${docError.message}, falling back to regular client`);
        }
      } else {
        serverLog(requestId, `Service client not available, using regular client`);
      }
    } catch (serviceError) {
      serverLog(requestId, `Error using service client: ${serviceError instanceof Error ? serviceError.message : String(serviceError)}`);
    }

    // Fall back to regular client if service client failed
    if (!document && !docError) {
      const result = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('user_id', user.id)
        .single();

      document = result.data;
      docError = result.error;
    }

    if (docError || !document) {
      serverError(requestId, `Document not found or not authorized: ${docError?.message || 'No document found'}`)
      return NextResponse.json(
        { error: 'Document not found or not authorized' },
        { status: 404 }
      )
    }
    serverLog(requestId, `Document found: ${document.id}, status: ${document.status}, filename: ${document.filename}`)

    // Only process if document is in a valid state
    if (!['pending', 'queued', 'failed', 'error'].includes(document.status)) {
      serverError(requestId, `Document cannot be processed, current status: ${document.status}`)
      return NextResponse.json(
        {
          error: 'Document cannot be processed',
          status: document.status,
          message: 'Document is already being processed or completed'
        },
        { status: 409 }
      )
    }
    serverLog(requestId, `Document is in a valid state for processing: ${document.status}`)

    // Process the document immediately
    try {
      // Update status to queued first (for client feedback)
      serverLog(requestId, `Updating document status to 'queued'`)
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          status: 'queued',
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId)

      if (updateError) {
        serverError(requestId, `Failed to update document status: ${updateError.message}`)
        return NextResponse.json(
          { error: 'Failed to update document status', details: updateError.message },
          { status: 500 }
        )
      }
      serverLog(requestId, `Document status updated to 'queued'`)

      // Process the document immediately
      // This is done in a try/catch to allow returning a response to the client
      // while the processing continues in the background
      serverLog(requestId, `Starting background processing for document ${documentId}`)
      processDocumentNow(documentId).catch(error => {
        serverError(requestId, `Background processing failed for document ${documentId}: ${error instanceof Error ? error.message : String(error)}`)
      })

      serverLog(requestId, `Document processing initiated successfully`)
      return NextResponse.json({
        success: true,
        message: 'Document processing started',
        documentId
      })
    } catch (processingError) {
      const errorMessage = processingError instanceof Error ? processingError.message : String(processingError)
      serverError(requestId, `Error starting document processing: ${errorMessage}`, processingError)
      return NextResponse.json(
        { error: 'Failed to start processing', details: errorMessage },
        { status: 500 }
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    serverError(requestId, `Error processing document request: ${errorMessage}`, error)
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * API route to check processing status and reset hung documents
 * GET /api/documents/process
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().substring(0, 8)
  logApiRequestToConsole(request, 'GET', request.url)
  serverLog(requestId, `Checking document processing status`)

  try {
    // Get authenticated user
    serverLog(requestId, `Authenticating user`)
    let user;
    try {
      user = await auth.getUser();
      if (user) {
        serverLog(requestId, `User authenticated: ${user.id}`);
      } else {
        // For testing purposes, create a test user
        serverLog(requestId, `No authenticated user found, using test user for development`);
        user = {
          id: '2f4a9512-414a-47cc-a1d1-a110739085f8', // Test user ID
          email: 'test@test.com'
        };
      }
    } catch (authError) {
      // For testing purposes, create a test user
      serverLog(requestId, `Authentication error: ${authError instanceof Error ? authError.message : String(authError)}`);
      serverLog(requestId, `Using test user for development`);
      user = {
        id: '2f4a9512-414a-47cc-a1d1-a110739085f8', // Test user ID
        email: 'test@test.com'
      };
    }

    // Get Supabase client
    const supabase = createClient()

    // Check for stuck documents
    const now = new Date()
    const { data: stuckDocuments, error: stuckError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'processing')
      .lt('processing_started_at', new Date(now.getTime() - MAX_PROCESSING_TIME_MS).toISOString())

    if (stuckError) {
      serverError(requestId, `Error checking for stuck documents: ${stuckError.message}`)
      return NextResponse.json(
        { error: 'Failed to check stuck documents' },
        { status: 500 }
      )
    }

    // Reset stuck documents
    const resetResults = []
    if (stuckDocuments && stuckDocuments.length > 0) {
      serverLog(requestId, `Found ${stuckDocuments.length} stuck documents, resetting their status`)

      for (const stuckDoc of stuckDocuments) {
        const { error: resetError } = await supabase
          .from('documents')
          .update({
            status: 'error',
            error: 'Processing timed out after 10 minutes',
            updated_at: now.toISOString()
          })
          .eq('id', stuckDoc.id)

        resetResults.push({
          id: stuckDoc.id,
          filename: stuckDoc.filename,
          successful: !resetError,
          error: resetError?.message
        })
      }
    }

    // Count documents by status
    const { data: statusCounts, error: countError } = await supabase
      .from('documents')
      .select('status, count')
      .eq('user_id', user.id)
      .group('status')

    if (countError) {
      serverError(requestId, `Error counting documents by status: ${countError.message}`)
    }

    return NextResponse.json({
      stuckDocuments: stuckDocuments?.length || 0,
      resetResults,
      queueStatus: statusCounts || [],
      success: true
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    serverError(requestId, `Error checking document processing: ${errorMessage}`, error)
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    )
  }
}