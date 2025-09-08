import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service-client';
import { executeOCR } from '@/lib/server/ocr-executor';
import { isQueuePaused } from '@/lib/server/queue-state';
import { mapToProcessingStatus } from '@/lib/database/utils/mappers';
import { getUUID } from '@/lib/uuid';

export async function POST(req: Request) {
  if (isQueuePaused()) {
    return NextResponse.json({ error: 'Queue is paused' }, { status: 409 });
  }

  const { jobId } = await req.json();
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data: jobData, error: jobError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', jobId)
    .single();
  if (jobError || !jobData) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  const job = mapToProcessingStatus(jobData);

  await supabase
    .from('documents')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  try {
    let base64: string | null = null;
    if (job.storagePath) {
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .download(job.storagePath);
      if (error) throw error;
      const buffer = Buffer.from(await data.arrayBuffer());
      base64 = buffer.toString('base64');
    }

    if (!base64) {
      throw new Error('File not found');
    }

    const { result, metadata } = await executeOCR(base64);
    const resultsArray = Array.isArray(result) ? result : [result];
    const now = new Date().toISOString();
    type JobUser = { userId?: string; user_id?: string };
    const jobUser = job as JobUser;
    const rows = resultsArray.map((text, idx) => ({
      id: getUUID(),
      document_id: jobId,
      page_number: idx + 1,
      content: text,
      created_at: now,
      updated_at: now,
      user_id: jobUser.userId ?? jobUser.user_id ?? null,
    }));
    await supabase.from('ocr_results').insert(rows);

    await supabase
      .from('documents')
      .update({
        status: 'completed',
        processing_completed_at: now,
        total_pages: resultsArray.length,
      })
      .eq('id', jobId);

    return NextResponse.json({ status: 'completed', metadata });
  } catch {
    await supabase
      .from('documents')
      .update({ status: 'failed', error: 'OCR failed' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
