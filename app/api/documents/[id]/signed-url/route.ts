import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { logApiRequestToConsole } from '@/lib/server-console-logger'
import { middlewareLog, prodError } from '@/lib/log'
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'
import { normalizeStoragePath } from '@/lib/storage/path'

/**
 * GET /api/documents/[id]/signed-url
 * Generate a signed URL for a document's stored image.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, 'GET', req.url, { id: params.id })

  const supabase = createServerSupabaseClient()
  const user = await getAuthenticatedUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = getServiceClient()
  if (!serviceClient) {
    return NextResponse.json({ error: 'Server error: service client not available' }, { status: 500 })
  }

  const { data: document, error: docError } = await serviceClient
    .from('documents')
    .select('storage_path')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (docError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Generate signed URL (reuse serviceClient)
  const bucket = 'ocr-documents'
  const fullPath = normalizeStoragePath(user.id, document.storage_path)
  const { data, error } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(fullPath, 60)
  if (error || !data.signedUrl) {
    prodError('[API] Error generating signed URL:', error as Error)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  middlewareLog('debug', '[API] Signed URL generated', {
    documentId: params.id,
    userId: user?.id
  })

  return NextResponse.json({ url: data.signedUrl })
}
