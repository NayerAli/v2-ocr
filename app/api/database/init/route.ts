import { NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

/**
 * GET /api/database/init
 * Get database initialization status
 */
export async function GET() {
  try {
    const status = db.getInitializationStatus();
    const isInitialized = await db.isInitialized();
    
    if (!isInitialized) {
      return NextResponse.json(
        {
          initialized: false,
          status: {
            attempts: status.attempts,
            error: status.error,
            maxAttempts: 3
          },
          retryAfter: 2
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
    
    return NextResponse.json(
      {
        initialized: true,
        status: {
          attempts: status.attempts,
          error: null
        }
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=5'
        }
      }
    );
  } catch (error) {
    console.error('Error checking database initialization:', error);
    return NextResponse.json(
      {
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: {
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