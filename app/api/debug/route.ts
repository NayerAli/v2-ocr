import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug
 * Debug endpoint to check database connectivity and contents
 */
export async function GET(request: NextRequest) {
  try {
    // Get Supabase URL and key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase credentials missing' },
        { status: 500 }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all documents
    const { data: documents, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .limit(10);

    if (documentError) {
      return NextResponse.json(
        { error: `Error fetching documents: ${documentError.message}` },
        { status: 500 }
      );
    }

    // Get all results
    const { data: results, error: resultError } = await supabase
      .from('results')
      .select('*')
      .limit(10);

    if (resultError) {
      return NextResponse.json(
        { error: `Error fetching results: ${resultError.message}` },
        { status: 500 }
      );
    }

    // Get database stats
    const stats = await db.getDatabaseStats();

    return NextResponse.json({
      documents,
      results,
      stats,
      message: 'Debug information fetched successfully'
    });
  } catch (error: any) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch debug information' },
      { status: 500 }
    );
  }
}