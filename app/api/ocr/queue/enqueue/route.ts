import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getUUID } from '@/lib/uuid';
import { getServiceClient } from '@/lib/supabase/service-client';
import type { ProcessingStatus } from '@/types';
import type { Database } from '@/types/supabase';

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookies) {
          cookies.forEach((cookie) =>
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          );
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
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

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const id = getUUID();
  if (file) {
    storagePath = `${id}/${file.name}`;
    await supabase.storage.from('ocr-documents').upload(storagePath, file);
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
    user_id: user.id,
  };

  await supabase.from('documents').insert({
    id: status.id,
    filename: status.filename,
    status: status.status,
    storage_path: status.storagePath,
    file_size: status.fileSize,
    file_type: status.fileType,
    created_at: status.createdAt?.toISOString(),
    updated_at: status.updatedAt?.toISOString(),
    user_id: status.user_id,
  });

  return NextResponse.json({ jobId: id });
}
