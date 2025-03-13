import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

interface Params {
  params: {
    id: string;
  };
}

/**
 * GET /api/results/[id]
 * Get the results of a processing job
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
    
    const results = await db.getResults(id);
    
    if (!results || results.length === 0) {
      return NextResponse.json(
        { error: 'No results found for this document' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error getting results:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get results' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/results/[id]
 * Delete OCR results for a specific document
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = params;
    
    // Save empty results to effectively delete them
    await db.saveResults(id, []);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting results:', error);
    return NextResponse.json(
      { error: 'Failed to delete results' },
      { status: 500 }
    );
  }
} 