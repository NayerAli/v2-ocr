import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getProcessingService } from '@/lib/ocr/processing-service';
import { getDefaultSettings } from '@/lib/default-settings';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const fileEntries = formData.getAll('files');
  const files = fileEntries.filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const service = await getProcessingService(getDefaultSettings());
  const ids = await service.addToQueue(files);
  return NextResponse.json({ ids });
}
