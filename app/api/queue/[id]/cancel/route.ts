import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth'
import { db } from '@/lib/database'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'

/**
 * POST /api/queue/:id/cancel
 * Cancel processing for a document owned by the current user.
 */
export async function POST(
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

    // Fetch the document from the queue to verify ownership and status
    const queue = await db.getQueue()
    const document = queue.find((doc) => doc.id === id)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // If the job is still running, cancel it through the processing service
    const processingService = await getProcessingService(getDefaultSettings())
    await processingService.cancelProcessing(id)

    // Update the document status to "cancelled" in the DB as a safeguard
    await db.updateQueueItem(id, {
      status: 'cancelled',
      error: undefined,
      processingCompletedAt: new Date(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Error cancelling processing', error)
    return NextResponse.json(
      { error: 'Failed to cancel processing' },
      { status: 500 }
    )
  }
}
