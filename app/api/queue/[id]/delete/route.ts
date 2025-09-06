import { NextRequest, NextResponse } from 'next/server'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'
import { middlewareLog, prodError } from '@/lib/log'
import { normalizeStoragePath } from '@/lib/storage/path'

/**
 * DELETE /api/queue/:id/delete
 * Delete a document from the queue
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the document ID from the URL
    const id = params.id
    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // Create Supabase client and get current user
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase)

    if (!user) {
      prodError('[API] DELETE /api/queue/[id]/delete - Unauthorized')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    middlewareLog('important', '[API] Deleting document', {
      documentId: id,
      userId: user.id
    })

    // Fetch the document to verify ownership and status
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // If the document is queued or processing, cancel it first
    if (document.status === 'processing' || document.status === 'queued') {
      try {
        const processingService = await getProcessingService(getDefaultSettings())
        await processingService.cancelProcessing(id)
      } catch (e) {
        prodError('[API] Error cancelling processing:', e as Error)
      }
    }

    // Remove the source file from storage if present
    if (document.storage_path) {
      const docPath = normalizeStoragePath(user.id, document.storage_path)

      const { error: storageError } = await supabase.storage
        .from('ocr-documents')
        .remove([docPath])

      // Ignore not found errors but surface any other issues
      const storageStatus = (storageError as { status?: number })?.status
      if (storageError && storageStatus !== 404) {
        prodError('[API] Error removing document from storage:', storageError)
        return NextResponse.json(
          { error: 'Failed to delete source file' },
          { status: 500 }
        )
      }
    }

    // Fetch OCR result storage paths to remove files from storage
    const { data: results, error: resultsFetchError } = await supabase
      .from('ocr_results')
      .select('storage_path')
      .eq('document_id', id)
      .eq('user_id', user.id)

    if (resultsFetchError) {
      prodError('[API] Error fetching OCR results for storage cleanup:', resultsFetchError)
    }

    const resultPaths = (results || [])
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p)
      .map((p) => normalizeStoragePath(user.id, p))

    if (resultPaths.length > 0) {
      const { error: resultStorageError } = await supabase.storage
        .from('ocr-documents')
        .remove(resultPaths)

      // Continue even if some result files are missing
      const resultStatus = (resultStorageError as { status?: number })?.status
      if (resultStorageError && resultStatus !== 404) {
        prodError('[API] Error removing OCR result files:', resultStorageError)
      }
    }

    // Delete any OCR results for this document (continue on error)
    const { error: ocrDeleteError } = await supabase
      .from('ocr_results')
      .delete()
      .eq('document_id', id)
      .eq('user_id', user.id)

    if (ocrDeleteError) {
      prodError('[API] Error removing OCR results:', ocrDeleteError)
    }

    // Delete the document itself
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      prodError('[API] Error removing document:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      )
    }

    // Clean up the empty document folder
    try {
      // Remove the document folder by attempting to remove a placeholder file
      // This will remove the empty folder structure
      await supabase.storage
        .from('ocr-documents')
        .remove([normalizeStoragePath(user.id, `${id}/.keep`)])
    } catch (e) {
      // Ignore folder cleanup errors as they're not critical
      middlewareLog('debug', '[API] Delete: Could not clean up empty document folder', e)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    prodError('[API] DELETE /api/queue/[id]/delete - Error deleting document', error as Error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}