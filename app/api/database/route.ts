import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';
import { getSettings } from '@/lib/server/settings';

/**
 * GET /api/database/stats
 * Get database statistics
 */
export async function GET() {
  try {
    // Check if database is initialized
    if (!db.isInitialized()) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 503 }
      );
    }
    
    const stats = await db.getDatabaseStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error getting database stats:', error);
    return NextResponse.json(
      { error: 'Failed to get database stats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/database/cleanup
 * Clean up old records
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action === 'cleanup') {
      const settings = await getSettings();
      await db.cleanupOldRecords(settings.database.retentionPeriod);
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error cleaning up database:', error);
    return NextResponse.json(
      { error: 'Failed to clean up database' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/database
 * Clear the database
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'queue' | 'results' | 'all' | null;
    
    await db.clearDatabase(type || 'all');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing database:', error);
    return NextResponse.json(
      { error: 'Failed to clear database' },
      { status: 500 }
    );
  }
} 