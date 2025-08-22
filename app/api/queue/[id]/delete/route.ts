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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}
