import { NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function POST(req: Request) {
  const { jobId } = await req.json();
  await db.updateQueueItem(jobId, { status: 'cancelled' });
  return NextResponse.json({ status: 'cancelled', jobId });
}
