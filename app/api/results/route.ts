import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    
    if (!documentId) {
      return NextResponse.json(
        { error: 'No document ID provided' },
        { status: 400 }
      );
    }
    
    // Get document status first
    const status = await db.getQueueItem(documentId);
    if (!status) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    // Check if document is still processing
    if (status.status === 'processing' || status.status === 'queued') {
      return NextResponse.json(
        { error: 'Document is still being processed', status },
        { status: 202 }
      );
    }
    
    // Get results
    const results = await db.getResults(documentId);
    
    return NextResponse.json({
      status,
      results
    });
  } catch (error) {
    console.error('Error getting OCR results:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get OCR results' },
      { status: 500 }
    );
  }
} 