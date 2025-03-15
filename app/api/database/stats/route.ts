import { NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

/**
 * GET /api/database/stats
 * Get database statistics
 */
export async function GET() {
  try {
    // Get detailed initialization status
    const isInitialized = await db.isInitialized();
    const status = db.getInitializationStatus();
    
    if (!isInitialized) {
      return NextResponse.json(
        { 
          error: 'Database not initialized',
          isInitializing: true,
          retryAfter: 2,
          details: {
            attempts: status.attempts,
            error: status.error
          }
        },
        { 
          status: 503,
          headers: {
            'Retry-After': '2',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        }
      );
    }
    
    const stats = await db.getDatabaseStats();
    return NextResponse.json(
      { stats },
      {
        headers: {
          'Cache-Control': 'private, max-age=5'
        }
      }
    );
  } catch (error) {
    console.error('Error getting database stats:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get database stats',
        isInitializing: false,
        details: {
          type: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
} 