import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server-wrapper'
import { auth } from '@/lib/auth.server'
import { retryDocumentFromServer } from '@/lib/ocr/retry-service'

/**
 * API route to retry processing a document
 * POST /api/documents/[id]/retry
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const user = await auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Not authenticated' },
        { status: 401 }
      )
    }

    const documentId = params.id
    
    // Verify the document exists and belongs to the user
    const supabase = createClient()
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not authorized' },
        { status: 404 }
      )
    }

    // Process the document immediately in the background
    retryDocumentFromServer(documentId).catch(error => {
      console.error(`Background processing failed for document ${documentId}:`, error)
    })
    
    return NextResponse.json({
      success: true,
      message: 'Document retry initiated',
      documentId
    })
  } catch (error) {
    console.error('Error retrying document:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    )
  }
} 