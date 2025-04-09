# Task 2: Update Results Functions to Use OCR Results Table

## Background
The database schema has been optimized, and the `results` table has been renamed to `ocr_results` with an improved structure. Now, we need to update all results-related functions to work with the new schema.

## Current Implementation
Currently, the application uses a `results` table to store OCR results. The results functions include:
- `db.getResults(id)` - Gets OCR results for a document
- `db.saveResults(id, results)` - Saves OCR results for a document

These functions are implemented in `lib/supabase-db.ts` and are used to retrieve and store OCR results after document processing.

## New Database Schema
In the new schema, the `ocr_results` table has a more structured format:

```sql
CREATE TABLE public.ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    language TEXT NOT NULL,
    processing_time FLOAT NOT NULL,
    page_number INTEGER NOT NULL,
    total_pages INTEGER,
    image_url TEXT,
    bounding_box JSONB,
    error TEXT,
    provider TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

## Required Changes

### 1. Update `db.getResults(id)`
This function should now query the `ocr_results` table.

**Current Implementation:**
```javascript
async getResults(id) {
  const { data, error } = await this.supabase
    .from('results')
    .select('*')
    .eq('document_id', id)
    .eq('user_id', this.userId);

  if (error) {
    console.error('Error fetching results:', error);
    throw error;
  }

  return data || [];
}
```

**New Implementation:**
```javascript
async getResults(id) {
  const { data, error } = await this.supabase
    .from('ocr_results')
    .select('*')
    .eq('document_id', id)
    .eq('user_id', this.userId)
    .order('page_number', { ascending: true });

  if (error) {
    console.error('Error fetching results:', error);
    throw error;
  }

  return data || [];
}
```

### 2. Update `db.saveResults(id, results)`
This function should now insert into the `ocr_results` table.

**Current Implementation:**
```javascript
async saveResults(id, results) {
  // First, verify that the document exists and belongs to the user
  const { data: document, error: documentError } = await this.supabase
    .from('queue')
    .select('id')
    .eq('id', id)
    .eq('user_id', this.userId)
    .single();

  if (documentError || !document) {
    console.error('Error verifying document ownership:', documentError);
    throw new Error('Document not found or not owned by user');
  }

  // Prepare results with user_id and document_id
  const resultsWithIds = results.map(result => ({
    ...result,
    document_id: id,
    user_id: this.userId
  }));

  // Save results
  const { error } = await this.supabase
    .from('results')
    .upsert(resultsWithIds);

  if (error) {
    console.error('Error saving results:', error);
    throw error;
  }

  return true;
}
```

**New Implementation:**
```javascript
async saveResults(id, results) {
  // First, verify that the document exists and belongs to the user
  const { data: document, error: documentError } = await this.supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', this.userId)
    .single();

  if (documentError || !document) {
    console.error('Error verifying document ownership:', documentError);
    throw new Error('Document not found or not owned by user');
  }

  // Prepare results with user_id and document_id
  const resultsWithIds = results.map(result => ({
    document_id: id,
    user_id: this.userId,
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
  const { error } = await this.supabase
    .from('ocr_results')
    .upsert(resultsWithIds, { onConflict: ['document_id', 'page_number', 'user_id'] });

  if (error) {
    console.error('Error saving results:', error);
    throw error;
  }

  return true;
}
```

## File Locations
These functions are located in:
- `lib/supabase-db.ts` - Main implementation of database functions
- `lib/database.ts` - Exports the database service

## Testing
After implementing these changes, test each function to ensure it works correctly with the new schema:

1. Test `db.getResults(id)` to ensure it returns OCR results for a document
2. Test `db.saveResults(id, results)` to ensure it saves OCR results for a document

## Notes
- Make sure to update any references to these functions in other parts of the application
- Ensure that all functions include proper user authentication and data isolation
- Consider adding caching for better performance
- Update any UI components that display OCR results to work with the new data structure
- The new implementation includes more structured data validation and default values
- The `upsert` operation now uses a conflict resolution strategy based on document_id, page_number, and user_id
