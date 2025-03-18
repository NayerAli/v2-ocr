import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug/[id]
 * Debug endpoint to check database results for a specific document
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
    
    // Get document
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (documentError) {
      return NextResponse.json(
        { error: `Error fetching document: ${documentError.message}` },
        { status: 500 }
      );
    }
    
    // Get results for document directly from Supabase
    const { data: results, error: resultError } = await supabase
      .from('results')
      .select('*')
      .eq('document_id', id);
    
    if (resultError) {
      return NextResponse.json(
        { error: `Error fetching results: ${resultError.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      document,
      results,
      resultsCount: results.length,
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