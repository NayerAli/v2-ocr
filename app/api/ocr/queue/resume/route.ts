import { NextResponse } from 'next/server';
import { resumeQueue } from '@/lib/server/queue-state';

export async function POST() {
  resumeQueue();
  return NextResponse.json({ status: 'resumed' });
}
