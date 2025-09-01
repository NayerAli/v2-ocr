import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getProcessingService } from '@/lib/ocr/processing-service'
import { getDefaultSettings } from '@/lib/default-settings'
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'
import { middlewareLog, prodError } from '@/lib/log'

/**
 * POST /api/queue/:id/cancel
 * Cancel processing for a document
 */
export async function POST(
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

    // Get the current user securely
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase)
    if (!user) {
      prodError('[API] POST /api/queue/[id]/cancel - Unauthorized')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    middlewareLog('important', '[API] Canceling processing for document', {
      documentId: id,
      userId: user.id
    })

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

    // Get processing service with default settings
    const processingService = await getProcessingService(getDefaultSettings())

    // Cancel processing
    await processingService.cancelProcessing(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    prodError('[API] POST /api/queue/[id]/cancel - Error canceling processing', error as Error)
    return NextResponse.json(
      { error: 'Failed to cancel processing' },
      { status: 500 }
    )
  }
}
