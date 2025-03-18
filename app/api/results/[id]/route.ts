import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';
import { createClient } from '@supabase/supabase-js';

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
    console.log(`[API] Fetching results for document: ${id}`);
    
    if (!id) {
      console.error('[API] No document ID provided');
      return NextResponse.json(
        { error: 'No ID provided' },
        { status: 400 }
      );
    }

    // First check if document exists
    try {
      const doc = await db.getQueueItem(id);
      if (!doc) {
        console.error(`[API] Document ${id} not found in queue`);
        return NextResponse.json(
          { error: 'Document not found in processing queue' },
          { status: 404 }
        );
      }
      console.log(`[API] Document found: ${doc.filename}, status: ${doc.status}`);
    } catch (docError) {
      console.error(`[API] Error checking document: ${docError instanceof Error ? docError.message : docError}`);
      // Continue anyway, as we're primarily interested in results
    }
    
    let results;
    try {
      console.log(`[API] Getting results from db.getResults for ${id}`);
      results = await db.getResults(id);
      console.log(`[API] Retrieved ${results.length} results for document ${id}`);
    } catch (resultsError) {
      console.error(`[API] Error from db.getResults: ${resultsError instanceof Error ? resultsError.message : resultsError}`);
      
      // Try a direct database query as fallback
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        console.log('[API] Attempting direct Supabase query as fallback');
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        try {
          const { data, error } = await supabase
            .from('results')
            .select('*')
            .eq('document_id', id);
          
          if (error) {
            console.error(`[API] Supabase direct query error: ${error.message}`);
            throw error;
          }
          
          if (data && data.length > 0) {
            console.log(`[API] Direct query returned ${data.length} results`);
            results = data.map(item => ({
              id: item.id,
              documentId: item.document_id,
              pageNumber: item.page || 0,
              text: item.text || '',
              confidence: item.confidence || 0,
              imageUrl: item.image_url || '',
              language: 'en',
              processingTime: 0
            }));
          } else {
            console.log('[API] No results found via direct query');
            results = [];
          }
        } catch (directError) {
          console.error(`[API] Direct query failed: ${directError instanceof Error ? directError.message : directError}`);
          throw directError;
        }
      } else {
        console.error('[API] No Supabase credentials for fallback');
        throw resultsError;
      }
    }
    
    if (!results || results.length === 0) {
      console.warn(`[API] No results found for document ${id}`);
      return NextResponse.json(
        { results: [], message: 'No results found for this document' },
        { status: 200 }
      );
    }
    
    console.log(`[API] Returning ${results.length} results for document ${id}`);
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('[API] Error getting results:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to get results',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
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