import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth'
import { db } from '@/lib/database'
import { processingService } from '@/lib/ocr/processing-service'

/**
 * POST /api/queue/:id/cancel
 * Cancel processing for a document
 */
export async function POST(
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

    // Get the current user
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[API] Canceling processing for document ${id}`)

    // Get the document from the queue
    const queue = await db.getQueue()
    const document = queue.find(doc => doc.id === id)

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check if the document belongs to the current user
    if (document.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Cancel processing
    await processingService.cancelProcessing(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error canceling processing:', error)
    return NextResponse.json(
      { error: 'Failed to cancel processing' },
      { status: 500 }
    )
  }
}
