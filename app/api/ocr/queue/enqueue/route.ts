import { NextResponse } from 'next/server';
import { getUUID } from '@/lib/uuid';
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'
import { getServiceClient } from '@/lib/supabase/service-client';
import { normalizeStoragePath } from '@/lib/storage/path'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const user = await getAuthenticatedUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const contentType = req.headers.get('content-type') || '';
  let file: File | null = null;
  let filename = 'unknown';
  let storagePath: string | undefined;

  if (contentType.includes('application/json')) {
    const data = await req.json();
    filename = data.name || filename;
    storagePath = data.storagePath;
    // Allow client to pass file metadata when pre-processing on client (e.g., PDFs -> images)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const incomingType: string | undefined = data.fileType;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const incomingSize: number | undefined = data.fileSize;
    if (incomingType) {
      // Persist file_type when no actual File is uploaded
      // We'll set these later when composing the row
      // Using a temporary variables via closure to reuse below
      // @ts-expect-error internal stash
      req.__incomingFileType = incomingType;
      // @ts-expect-error internal stash
      req.__incomingFileSize = incomingSize;
    }
  } else {
    const formData = await req.formData();
    const fileField = formData.get('file');
    if (fileField instanceof File) {
      file = fileField;
      filename = file.name;
    }
  }

  const id = getUUID();
  if (file) {
    // Store objects under user-scoped prefix to align with signing utilities
    const relativePath = `${id}/${file.name}`
    const fullPath = normalizeStoragePath(user.id, relativePath)
    storagePath = relativePath
    const svc = getServiceClient();
    if (svc) {
      await svc.storage.from('ocr-documents').upload(fullPath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
    }
  }

  // Persist the queue item directly using the authenticated server client
  const now = new Date().toISOString()
  const row = {
    id,
    filename,
    original_filename: filename,
    status: 'queued' as const,
    progress: 0,
    current_page: 0,
    total_pages: 0,
    // Pick values from file if provided, otherwise accept incoming metadata from JSON
    // @ts-expect-error internal stash
    file_size: file?.size ?? (req.__incomingFileSize as number | undefined) ?? null,
    // @ts-expect-error internal stash
    file_type: file?.type ?? (req.__incomingFileType as string | undefined) ?? null,
    storage_path: storagePath ?? null,
    thumbnail_path: null as string | null,
    error: null as string | null,
    processing_started_at: null as string | null,
    processing_completed_at: null as string | null,
    created_at: now,
    updated_at: now,
    user_id: user.id,
  }

  const { error } = await supabase
    .from('documents')
    .upsert(row, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: 'Failed to enqueue document' }, { status: 500 })
  }

  return NextResponse.json({ jobId: id })
}
