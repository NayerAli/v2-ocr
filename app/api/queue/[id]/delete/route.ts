import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth'
import { db } from '@/lib/database'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'

/**
 * DELETE /api/queue/:id/delete
 * Permanently remove a document from the queue and database.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Ensure the user is authenticated
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the document from the queue to verify ownership
    const queue = await db.getQueue()
    const document = queue.find((doc) => doc.id === id)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // If the document is currently processing, cancel it first
    if (document.status === 'processing') {
      const processingService = await getProcessingService(getDefaultSettings())
      await processingService.cancelProcessing(id)
    }

    // Remove document and associated OCR results from DB/storage
    await db.removeFromQueue(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Error deleting document', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}
