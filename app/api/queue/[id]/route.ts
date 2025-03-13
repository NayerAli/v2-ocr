import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';
import { getProcessingStatus, cancelProcessing } from '@/lib/server/processing-service';

interface Params {
  params: {
    id: string;
  };
}

/**
 * GET /api/queue/[id]
 * Get a specific item from the processing queue
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = params;
    const status = await getProcessingStatus(id);
    
    if (!status) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting queue item:', error);
    return NextResponse.json(
      { error: 'Failed to get queue item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/queue/[id]
 * Remove an item from the processing queue
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = params;
    
    // Try to cancel if it's processing
    await cancelProcessing(id);
    
    // Remove from queue
    await db.removeFromQueue(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing queue item:', error);
    return NextResponse.json(
      { error: 'Failed to remove queue item' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/queue/[id]/cancel
 * Cancel processing for an item
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action === 'cancel') {
      const success = await cancelProcessing(id);
      
      if (!success) {
        return NextResponse.json(
          { error: 'Item not found or not processing' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error performing action on queue item:', error);
    return NextResponse.json(
      { error: 'Failed to perform action' },
      { status: 500 }
    );
  }
} 