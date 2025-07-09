import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/server-auth'
import { logApiRequestToConsole } from '@/lib/server-console-logger'

/**
 * GET /api/documents/[id]/signed-url
 * Generate a signed URL for a document's stored image.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  logApiRequestToConsole(req, 'GET', req.url, { id })

  // TESTING: bypass auth for signed-url via x-api-key header
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch document; if bypassing, skip user_id constraint
  let query = supabase.from('documents').select('storage_path').eq('id', id)
  query = query.eq('user_id', user.id)
  const { data: document, error: docError } = await query.single()
  if (docError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Generate signed URL (reuse serviceClient)
  const bucket = 'ocr-documents'
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(document.storage_path, 60)
  if (error || !data.signedUrl) {
    console.error('Error generating signed URL:', error)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
