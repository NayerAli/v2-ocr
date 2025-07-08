import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getProcessingService } from '@/lib/ocr/processing-service';
import { getDefaultSettings } from '@/lib/default-settings';

export async function POST() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const service = await getProcessingService(getDefaultSettings());
  await service.pauseQueue();
  return NextResponse.json({ success: true });
}
