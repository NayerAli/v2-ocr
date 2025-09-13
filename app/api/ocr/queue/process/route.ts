import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service-client';
import { executeOCR } from '@/lib/server/ocr-executor';
import { isQueuePaused } from '@/lib/server/queue-state';
import { mapToProcessingStatus } from '@/lib/database/utils/mappers';
import { getUUID } from '@/lib/uuid';
import { normalizeStoragePath } from '@/lib/storage/path'
import { convertPdfToJpegs } from '@/lib/server/pdf-to-images'
import type { OCRResult } from '@/types'

export async function POST(req: Request) {
  // Minimal diagnostic log
  try {
    const body = await req.clone().json().catch(() => null)
    if (body?.jobId) {
      console.log('[OCR] Processing request received for job:', body.jobId)
    }
  } catch {}

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
    const userId = (job as unknown as { userId?: string; user_id?: string }).userId ?? (job as unknown as { userId?: string; user_id?: string }).user_id ?? ''

    let resultsArray: OCRResult[] = []
    let metadata: Record<string, unknown> = {}

    // If this looks like a PDF workflow, process page images stored under the job folder
    const isPdf = (job as unknown as { fileType?: string; file_type?: string }).fileType === 'application/pdf'
      || (job as unknown as { fileType?: string; file_type?: string }).file_type === 'application/pdf'
      || (job.storagePath?.toLowerCase().endsWith('.pdf') ?? false)

    if (isPdf) {
      console.log('[OCR] PDF detected for job:', jobId)

      try {
        // 1) Download original PDF from storage
        let pdfData: ArrayBuffer | null = null
        if (job.storagePath) {
          const path = normalizeStoragePath(userId || '', job.storagePath)
          console.log('[OCR] Downloading PDF from storage path:', path)

          const { data, error } = await supabase.storage
            .from('ocr-documents')
            .download(path)

          if (error) {
            console.error('[OCR] Failed to download PDF from storage:', error)
            throw new Error(`Failed to download PDF: ${error.message}`)
          }

          const arr = await data.arrayBuffer()
          pdfData = arr
          console.log('[OCR] PDF downloaded successfully, bytes:', arr.byteLength)
        }

        if (!pdfData) {
          throw new Error('PDF file not found in storage')
        }

        // 2) Convert PDF pages to JPEG (server-side)
        console.log('[OCR] Starting PDF to images conversion...')
        const pages = await convertPdfToJpegs(pdfData)
        console.log('[OCR] PDF converted to images successfully, pages:', pages.length)

        if (pages.length === 0) {
          throw new Error('PDF conversion resulted in no pages')
        }

        // 3) Upload page images to Storage and OCR each page
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i]
          console.log(`[OCR] Processing page ${p.pageNumber}/${pages.length}...`)

          try {
            const relPath = `${jobId}/Page_${p.pageNumber}_${jobId}.jpg`
            const fullPath = normalizeStoragePath(userId, relPath)

            // Verify the base64 image is not empty
            if (!p.base64 || p.base64.length < 100) {
              console.warn(`[OCR] Page ${p.pageNumber} has empty or very small base64 data (${p.base64?.length || 0} chars)`)
              throw new Error(`Page ${p.pageNumber} generated empty image`)
            }

            console.log(`[OCR] Uploading page ${p.pageNumber} image to storage (${p.base64.length} chars)...`)

            // Upload page image if not present
            const uploadResult = await supabase.storage.from('ocr-documents').upload(fullPath, Buffer.from(p.base64, 'base64'), {
              contentType: 'image/jpeg',
              upsert: true,
            })

            if (uploadResult.error) {
              console.error(`[OCR] Failed to upload page ${p.pageNumber} image:`, uploadResult.error)
              throw new Error(`Failed to upload page ${p.pageNumber} image: ${uploadResult.error.message}`)
            }

            console.log(`[OCR] Page ${p.pageNumber} image uploaded successfully`)
            console.log(`[OCR] Starting OCR for page ${p.pageNumber}...`)

            const { result, metadata: md } = await executeOCR(p.base64, {}, { fileType: 'image/jpeg' })
            metadata = md
            const r = Array.isArray(result) ? (result as OCRResult[])[0] : (result as OCRResult)

            // Log OCR result for debugging
            console.log(`[OCR] Page ${p.pageNumber} OCR completed:`, {
              textLength: r.text?.length || 0,
              confidence: r.confidence,
              language: r.language
            })

            resultsArray.push({ ...r, pageNumber: p.pageNumber, totalPages: pages.length })
          } catch (pageError) {
            console.error(`[OCR] Error processing page ${p.pageNumber}:`, pageError)
            throw new Error(`Failed to process page ${p.pageNumber}: ${String(pageError)}`)
          }
        }

        console.log('[OCR] All PDF pages processed successfully')
      } catch (pdfError) {
        console.error('[OCR] PDF processing failed:', pdfError)
        throw new Error(`PDF processing failed: ${String(pdfError)}`)
      }
    } else {
      // Image flow – download the original storagePath and OCR it
      let base64: string | null = null
      if (job.storagePath) {
        const path = normalizeStoragePath(userId || '', job.storagePath)
        const { data, error } = await supabase.storage
          .from('ocr-documents')
          .download(path)
        if (error) throw error
        const buffer = Buffer.from(await data.arrayBuffer())
        base64 = buffer.toString('base64')
      }

      if (!base64) {
        throw new Error('File not found')
      }

      const exec = await executeOCR(base64, {}, { fileType: job.fileType })
      metadata = exec.metadata as Record<string, unknown>
      const result = exec.result
      resultsArray = Array.isArray(result) ? (result as OCRResult[]) : ([result] as OCRResult[])
    }

    // Minimal logging for diagnostics (first 10 chars only)
    try {
      const previews = resultsArray.map((r, i) => ({ page: (r.pageNumber ?? i + 1), preview: String(r.text ?? '').slice(0, 10) }));
      console.log('[OCR] Results preview:', previews);
    } catch {}
    const now = new Date().toISOString();
    type JobUser = { userId?: string; user_id?: string };
    const jobUser = job as JobUser;
    const providerUsed = (metadata as unknown as { provider?: string }).provider ?? 'unknown';

    const rows = resultsArray.map((r, idx) => ({
      id: getUUID(),
      document_id: jobId,
      text: r.text ?? '',
      confidence: r.confidence ?? 0,
      language: r.language ?? 'en',
      processing_time: r.processingTime ?? 0,
      page_number: r.pageNumber ?? (idx + 1),
      total_pages: r.totalPages ?? resultsArray.length,
      // Save relative storage path (without user prefix) for signing on the client
      storage_path: isPdf
        ? // For PDFs we reference the page image path
          `${jobId}/Page_${(r.pageNumber ?? (idx + 1))}_${jobId}.jpg`
        : (job.storagePath ?? null),
      image_url: null,
      provider: providerUsed,
      created_at: now,
      user_id: jobUser.userId ?? jobUser.user_id ?? null,
    }));
    // If results already exist for this document (and user), keep them to avoid duplicates.
    // This favors stability and prevents accidental double-processing.
    const { count: existingCount } = await supabase
      .from('ocr_results')
      .select('*', { head: true, count: 'exact' })
      .eq('document_id', jobId)
      .eq('user_id', jobUser.userId ?? jobUser.user_id ?? null)

    if ((existingCount ?? 0) > 0) {
      console.log(`[OCR] Results already exist for document ${jobId}; skipping insert.`);
    } else {
      // Prefer insert. If table lacks optional columns in some environments,
      // retry without them. Always log errors minimally.
      const insert1 = await supabase.from('ocr_results').insert(rows);
      if (insert1.error) {
        console.error('[OCR] Insert ocr_results failed (attempt 1):', insert1.error.message);
        // Retry without optional columns for compatibility
        const minimalRows = rows.map(({ id, document_id, text, confidence, language, processing_time, page_number, total_pages, created_at, user_id, provider }) => ({
          id,
          document_id,
          text,
          confidence,
          language,
          processing_time,
          page_number,
          total_pages,
          created_at,
          provider,
          user_id,
        }));
        const insert2 = await supabase.from('ocr_results').insert(minimalRows as unknown as Record<string, unknown>[]);
        if (insert2.error) {
          console.error('[OCR] Insert ocr_results failed (attempt 2):', insert2.error.message);
          throw insert2.error; // handled by catch below
        } else {
          console.log(`[OCR] Saved ${minimalRows.length} result(s) (compat mode) for document ${jobId}`);
        }
      } else {
        console.log(`[OCR] Saved ${rows.length} result(s) for document ${jobId}`);
      }
    }

    await supabase
      .from('documents')
      .update({
        status: 'completed',
        processing_completed_at: now,
        total_pages: resultsArray.length,
      })
      .eq('id', jobId);

    return NextResponse.json({ status: 'completed', metadata });
  } catch (e) {
    console.error('[OCR] Processing failed for job', jobId, '-', e instanceof Error ? e.message : e)
    await supabase
      .from('documents')
      .update({ status: 'failed', error: 'OCR failed' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
