import { NextResponse } from 'next/server';
import { pauseQueue } from '@/lib/server/queue-state';

export async function POST() {
  pauseQueue();
  return NextResponse.json({ status: 'paused' });
}
