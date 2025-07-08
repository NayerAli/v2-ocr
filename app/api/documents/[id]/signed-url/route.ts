import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bypassKey = req.headers.get('x-api-key')
  const bypassAuth = bypassKey && serviceKey && bypassKey === serviceKey
  const serviceClient = getServiceClient()
  if (!serviceClient) {
    return NextResponse.json({ error: 'Server error: service client not available' }, { status: 500 })
  }
  let user = null
  if (!bypassAuth) {
    // Authenticate user via Bearer token
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    user = userData.user
  }

  // Fetch document; if bypassing, skip user_id constraint
  let query = serviceClient.from('documents').select('storage_path').eq('id', id)
  if (!bypassAuth && user) {
    query = query.eq('user_id', user.id)
  } else if (!bypassAuth) {
    // If we're not bypassing auth but user is null, return unauthorized
    return NextResponse.json({ error: 'Unauthorized: User not found' }, { status: 401 })
  }
  const { data: document, error: docError } = await query.single()
  if (docError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Generate signed URL (reuse serviceClient)
  const bucket = 'ocr-documents'
  const { data, error } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(document.storage_path, 60)
  if (error || !data.signedUrl) {
    console.error('Error generating signed URL:', error)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
