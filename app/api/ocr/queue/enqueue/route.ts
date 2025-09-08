import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getUUID } from '@/lib/uuid';
import { getUser } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/service-client';
import type { ProcessingStatus } from '@/types';

export async function POST(req: Request) {
  const user = await getUser();
  const contentType = req.headers.get('content-type') || '';
  let file: File | null = null;
  let filename = 'unknown';
  let storagePath: string | undefined;

  if (contentType.includes('application/json')) {
    const data = await req.json();
    filename = data.name || filename;
    storagePath = data.storagePath;
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
    storagePath = `${id}/${file.name}`;
    const supabase = getServiceClient();
    if (supabase) {
      await supabase.storage.from('ocr-documents').upload(storagePath, file);
    }
  }

  const status: Partial<ProcessingStatus> = {
    id,
    filename,
    status: 'queued',
    storagePath,
    fileSize: file?.size,
    fileType: file?.type,
    createdAt: new Date(),
    updatedAt: new Date(),
    user_id: user?.id,
  };

  await db.addToQueue(status);

  return NextResponse.json({ jobId: id });
}
