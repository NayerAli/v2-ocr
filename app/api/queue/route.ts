import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

/**
 * GET /api/queue
 * Get all items in the processing queue
 */
export async function GET() {
  try {
    // Check database initialization
    const isInitialized = await db.isInitialized();
    const status = db.getInitializationStatus();
    
    if (!isInitialized) {
      console.log('[API Queue] Database not initialized');
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
    
    console.log('[API Queue] Getting queue from database');
    const queue = await db.getQueue();
    console.log(`[API Queue] Retrieved ${queue.length} documents from queue`);
    
    return NextResponse.json({ queue }, {
      headers: {
        'Cache-Control': 'private, max-age=5'
      }
    });
  } catch (error) {
    console.error('Error getting queue:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get queue',
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

/**
 * DELETE /api/queue
 * Clear the processing queue
 */
export async function DELETE() {
  try {
    // Check database initialization
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
    
    await db.clearDatabase('queue');
    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error) {
    console.error('Error clearing queue:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to clear queue',
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