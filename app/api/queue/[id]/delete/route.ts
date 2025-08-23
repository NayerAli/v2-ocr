import { NextRequest, NextResponse } from 'next/server'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'
import { createServerSupabaseClient, getServerUser } from '@/lib/server-auth'

/**
 * DELETE /api/queue/:id/delete
 * Delete a document from the queue
 */
export async function DELETE(
  request: NextRequest,
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
    const user = await getServerUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[API] Deleting document ${id}`)

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
        console.error('Error cancelling processing:', e)
      }
    }

    // Remove the source file from storage if present
    if (document.storage_path) {
      const docPath = document.storage_path.startsWith(`${user.id}/`)
        ? document.storage_path
        : `${user.id}/${document.storage_path}`

      const { error: storageError } = await supabase.storage
        .from('ocr-documents')
        .remove([docPath])

      if (storageError) {
        console.error('Error removing document from storage:', storageError)
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
      console.error('Error fetching OCR results for storage cleanup:', resultsFetchError)
      return NextResponse.json(
        { error: 'Failed to fetch OCR results' },
        { status: 500 }
      )
    }

    const resultPaths = (results || [])
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p)
      .map((p) => (p.startsWith(`${user.id}/`) ? p : `${user.id}/${p}`))

    if (resultPaths.length > 0) {
      const { error: resultStorageError } = await supabase.storage
        .from('ocr-documents')
        .remove(resultPaths)

      if (resultStorageError) {
        console.error('Error removing OCR result files:', resultStorageError)
        return NextResponse.json(
          { error: 'Failed to delete OCR result files' },
          { status: 500 }
        )
      }
    }

    // Delete any OCR results for this document
    const { error: ocrDeleteError } = await supabase
      .from('ocr_results')
      .delete()
      .eq('document_id', id)
      .eq('user_id', user.id)

    if (ocrDeleteError) {
      console.error('Error removing OCR results:', ocrDeleteError)
      return NextResponse.json(
        { error: 'Failed to delete OCR results' },
        { status: 500 }
      )
    }

    // Delete the document itself
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error removing document:', deleteError)
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
        .remove([`${user.id}/${id}/.keep`])
    } catch (e) {
      // Ignore folder cleanup errors as they're not critical
      console.log('Note: Could not clean up empty document folder:', e)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}