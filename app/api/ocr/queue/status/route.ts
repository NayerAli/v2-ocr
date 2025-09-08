import { NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  if (jobId) {
    const job = await db.getDocument(jobId);
    return NextResponse.json({ job });
  }
  const jobs = await db.getQueue();
  return NextResponse.json({ jobs });
}
