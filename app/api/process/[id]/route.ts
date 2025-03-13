import { NextRequest, NextResponse } from 'next/server';
import { getProcessingStatus, cancelProcessing } from '@/lib/server/processing-service';

/**
 * GET /api/process/[id]
 * Get the status of a processing job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    if (!id) {
      return NextResponse.json(
        { error: 'No ID provided' },
        { status: 400 }
      );
    }
    
    const status = await getProcessingStatus(id);
    
    if (!status) {
      return NextResponse.json(
        { error: 'Processing job not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ status });
  } catch (error: any) {
    console.error('Error getting processing status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get processing status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/process/[id]
 * Cancel a processing job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    if (!id) {
      return NextResponse.json(
        { error: 'No ID provided' },
        { status: 400 }
      );
    }
    
    const success = await cancelProcessing(id);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to cancel processing job' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error cancelling processing job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel processing job' },
      { status: 500 }
    );
  }
} 