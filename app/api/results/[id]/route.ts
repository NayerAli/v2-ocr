import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServerUser } from '@/lib/server-auth'
import { logApiRequestToConsole } from '@/lib/server-console-logger'

/**
 * Tell Next.js this is a dynamic route that should not be statically generated
 * This prevents the "Request is not defined" error during build
 */
export const dynamic = 'force-dynamic'

/**
 * GET /api/results/[id]
 * Get OCR results for a document
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, 'GET', req.url, { id: params.id })

  try {
    // Get the current user from the server
    const user = await getServerUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Create a Supabase client
    const supabase = createClient()

    // First, check if the document exists and belongs to the user
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      )
    }

    // Get OCR results
    const { data, error } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', params.id)
      .eq('user_id', user.id)
      .order('page_number', { ascending: true })

    if (error) {
      console.error('Error fetching OCR results:', error)
      return NextResponse.json(
        { error: 'Failed to fetch OCR results' },
        { status: 500 }
      )
    }

    // Set cache headers
    const headers = new Headers()
    headers.set('Cache-Control', 'private, max-age=3600') // Cache for 1 hour

    return NextResponse.json(
      { results: data || [] },
      {
        status: 200,
        headers
      }
    )
  } catch (error) {
    console.error('Error in GET /api/results/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/results/[id]
 * Save OCR results for a document
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, 'POST', req.url, { id: params.id })

  try {
    // Get the current user from the server
    const user = await getServerUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Create a Supabase client
    const supabase = createClient()

    // First, check if the document exists and belongs to the user
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      )
    }

    // Get the request body
    const body = await req.json()
    const { results } = body

    if (!results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected an array of results.' },
        { status: 400 }
      )
    }

    // Prepare results with user_id and document_id
    const resultsWithIds = results.map(result => ({
      document_id: params.id,
      user_id: user.id,
      text: result.text || '',
      confidence: result.confidence || 0,
      language: result.language || 'en',
      processing_time: result.processing_time || 0,
      page_number: result.page_number || 1,
      total_pages: result.total_pages || 1,
      image_url: result.image_url || null,
      bounding_box: result.bounding_box || null,
      error: result.error || null,
      provider: result.provider || 'unknown'
    }))

    // Save results
    const { error } = await supabase
      .from('ocr_results')
      .upsert(resultsWithIds, { onConflict: ['document_id', 'page_number', 'user_id'] })

    if (error) {
      console.error('Error saving OCR results:', error)
      return NextResponse.json(
        { error: 'Failed to save OCR results' },
        { status: 500 }
      )
    }

    // Update document status to completed
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating document status:', updateError)
      // Continue even if status update fails
    }

    return NextResponse.json(
      { success: true, message: 'OCR results saved successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in POST /api/results/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
