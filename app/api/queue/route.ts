import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';
import { getAllProcessingStatuses } from '@/lib/server/processing-service';

/**
 * GET /api/queue
 * Get all items in the processing queue
 */
export async function GET() {
  try {
    const queue = await getAllProcessingStatuses();
    return NextResponse.json(queue);
  } catch (error) {
    console.error('Error getting queue:', error);
    return NextResponse.json(
      { error: 'Failed to get queue' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/queue
 * Clear the processing queue
 */
export async function DELETE() {
  try {
    await db.clearDatabase('queue');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing queue:', error);
    return NextResponse.json(
      { error: 'Failed to clear queue' },
      { status: 500 }
    );
  }
} 