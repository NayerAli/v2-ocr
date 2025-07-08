import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getProcessingService } from '@/lib/ocr/processing-service';
import { getDefaultSettings } from '@/lib/default-settings';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  const service = await getProcessingService(getDefaultSettings());
  const status = await service.retryDocument(id);
  if (!status) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, status });
}
