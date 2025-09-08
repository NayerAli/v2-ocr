import { NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function POST(req: Request) {
  const { jobId } = await req.json();
  const job = await db.updateQueueItem(jobId, { status: 'queued', error: undefined });
  return NextResponse.json({ job });
}
