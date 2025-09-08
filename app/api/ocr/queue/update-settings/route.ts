import { NextResponse } from 'next/server';
import { systemSettingsService } from '@/lib/system-settings-service';

export async function POST(req: Request) {
  try {
    const { ocr, processing, upload } = await req.json();
    if (ocr) await systemSettingsService.updateOCRDefaults(ocr);
    if (processing) await systemSettingsService.updateProcessingSettings(processing);
    if (upload) await systemSettingsService.updateUploadLimits(upload);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
