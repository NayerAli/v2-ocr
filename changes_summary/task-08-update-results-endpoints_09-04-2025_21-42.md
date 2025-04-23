# Task 8: Update API Endpoints for OCR Results

## Background
The database schema has been optimized, and the `results` table has been renamed to `ocr_results` with an improved structure. Now, we need to update all results-related API endpoints to work with the new schema.

## Current Implementation
Currently, the application uses the following results-related endpoints:
- GET /api/results/:id - Get OCR results for a document
- POST /api/results/:id - Save OCR results for a document

These endpoints are implemented in `app/api/results/[id]/route.ts` using Next.js App Router API routes and interact with the `results` table in the database.

## Required Changes

### 1. Update GET /api/results/:id Endpoint
This endpoint should now query the `ocr_results` table.

**Implementation:**
```javascript
// File: app/api/results/[id]/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // First, verify that the document exists and belongs to the user
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      );
    }

    // Get OCR results
    const { data, error } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', session.user.id)
      .order('page_number', { ascending: true });

    if (error) {
      console.error('Error fetching OCR results:', error);
      return NextResponse.json(
        { error: 'Failed to fetch OCR results' },
        { status: 500 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

    return NextResponse.json(
      { results: data || [] },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/results/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Update POST /api/results/:id Endpoint
This endpoint should now insert into the `ocr_results` table.

**Implementation:**
```javascript
// File: app/api/results/[id]/route.js
// Add this to the existing file with the GET handler

export async function POST(request, { params }) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // First, verify that the document exists and belongs to the user
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { results } = body;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty results array' },
        { status: 400 }
      );
    }

    // Prepare results with user_id and document_id
    const resultsWithIds = results.map(result => ({
      document_id: id,
      user_id: session.user.id,
      text: result.text || '',
      confidence: result.confidence || 0,
      language: result.language || 'en',
      processing_time: result.processing_time || 0,
      page_number: result.page_number || 1,
      total_pages: result.total_pages || 1,
      image_url: result.image_url || null,
      bounding_box: result.bounding_box || null,
      error: result.error || null,
      provider: result.provider || 'unknown'
    }));

    // Save results
    const { error } = await supabase
      .from('ocr_results')
      .upsert(resultsWithIds, { onConflict: ['document_id', 'page_number', 'user_id'] });

    if (error) {
      console.error('Error saving OCR results:', error);
      return NextResponse.json(
        { error: 'Failed to save OCR results' },
        { status: 500 }
      );
    }

    // Update document status to completed
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (updateError) {
      console.error('Error updating document status:', updateError);
      // Continue even if status update fails
    }

    return NextResponse.json(
      { success: true, message: 'OCR results saved successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in POST /api/results/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## File Locations
These endpoints should be updated in the following file:
- `app/api/results/[id]/route.ts` - For GET and POST /api/results/:id

Note that the application uses TypeScript, so the file has the `.ts` extension. The existing implementation can be found in this file.

## Testing
After implementing these changes, test each endpoint to ensure it works correctly:

1. Test GET /api/results/:id to ensure it returns OCR results for a document
2. Test POST /api/results/:id to ensure it saves OCR results for a document

## Notes
- Make sure to add proper error handling and validation
- Ensure that all endpoints include proper authentication checks
- Set appropriate cache headers for GET requests
- The POST endpoint should validate the results array and provide default values for missing fields
- The POST endpoint should also update the document status to 'completed' after saving the results
- The `upsert` operation now uses a conflict resolution strategy based on document_id, page_number, and user_id
- Update any UI components that interact with these endpoints to work with the new data structure
- These endpoints now work with the `ocr_results` table instead of the `results` table, but maintain the same API interface for backward compatibility

## Additional Considerations

### 1. Add Pagination Support
If documents may have many pages of OCR results, consider adding pagination support to the GET endpoint:

```javascript
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // Calculate range
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Rest of the implementation...

    // Get OCR results with pagination
    const { data, error, count } = await supabase
      .from('ocr_results')
      .select('*', { count: 'exact' })
      .eq('document_id', id)
      .eq('user_id', session.user.id)
      .order('page_number', { ascending: true })
      .range(from, to);

    // Return with pagination metadata
    return NextResponse.json({
      results: data || [],
      pagination: {
        page,
        pageSize,
        totalItems: count,
        totalPages: Math.ceil(count / pageSize)
      }
    }, { status: 200, headers });
  } catch (error) {
    // Error handling...
  }
}
```

### 2. Add Filtering Support
Consider adding filtering options to the GET endpoint:

```javascript
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0');
    const provider = searchParams.get('provider');

    // Rest of the implementation...

    // Build query
    let query = supabase
      .from('ocr_results')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', session.user.id);

    // Apply filters
    if (minConfidence > 0) {
      query = query.gte('confidence', minConfidence);
    }

    if (provider) {
      query = query.eq('provider', provider);
    }

    // Execute query
    const { data, error } = await query.order('page_number', { ascending: true });

    // Rest of the implementation...
  } catch (error) {
    // Error handling...
  }
}
```
