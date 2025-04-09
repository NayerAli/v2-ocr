# Task 3: Create Document Management Functions

## Background
The database schema has been optimized with a new `documents` table that serves as the main table for document storage and processing status. We need to create new document management functions to work with this table.

## Current Implementation
Currently, the application doesn't have dedicated document management functions. It uses the queue table for document management. The queue-related functions in `lib/supabase-db.ts` handle document operations, but there are no specific functions for general document management outside the queue context.

## New Database Schema
In the new schema, the `documents` table is the central table for document management:

```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'queued', 'error', 'cancelled')),
    progress FLOAT DEFAULT 0,
    current_page INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    rate_limit_info JSONB
);
```

## Required Functions

### 1. Create `db.getDocuments()`
This function should retrieve all documents for the current user.

**Implementation:**
```javascript
async getDocuments() {
  const { data, error } = await this.supabase
    .from('documents')
    .select('*')
    .eq('user_id', this.userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }

  return data || [];
}
```

### 2. Create `db.getDocument(id)`
This function should retrieve a specific document.

**Implementation:**
```javascript
async getDocument(id) {
  const { data, error } = await this.supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', this.userId)
    .single();

  if (error) {
    console.error('Error fetching document:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Document not found or not owned by user');
  }

  return data;
}
```

### 3. Create `db.saveDocument(document)`
This function should save a document.

**Implementation:**
```javascript
async saveDocument(document) {
  // Ensure required fields are present
  if (!document.filename || !document.original_filename || !document.file_size ||
      !document.file_type || !document.storage_path) {
    throw new Error('Missing required document fields');
  }

  // Prepare document with user_id and timestamps
  const documentWithUser = {
    ...document,
    user_id: this.userId,
    status: document.status || 'pending',
    created_at: document.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // If it's a new document, generate an ID
  if (!documentWithUser.id) {
    documentWithUser.id = crypto.randomUUID();
  }

  const { data, error } = await this.supabase
    .from('documents')
    .upsert(documentWithUser, { onConflict: ['id', 'user_id'] })
    .select()
    .single();

  if (error) {
    console.error('Error saving document:', error);
    throw error;
  }

  return data;
}
```

### 4. Create `db.deleteDocument(id)`
This function should delete a document.

**Implementation:**
```javascript
async deleteDocument(id) {
  // First, check if the document exists and belongs to the user
  const { data: document, error: documentError } = await this.supabase
    .from('documents')
    .select('id, storage_path, thumbnail_path')
    .eq('id', id)
    .eq('user_id', this.userId)
    .single();

  if (documentError || !document) {
    console.error('Error verifying document ownership:', documentError);
    throw new Error('Document not found or not owned by user');
  }

  // Delete the document from storage if it exists
  if (document.storage_path) {
    const { error: storageError } = await this.supabase
      .storage
      .from('documents')
      .remove([document.storage_path]);

    if (storageError) {
      console.error('Error deleting document from storage:', storageError);
      // Continue with deletion even if storage removal fails
    }
  }

  // Delete the thumbnail from storage if it exists
  if (document.thumbnail_path) {
    const { error: thumbnailError } = await this.supabase
      .storage
      .from('thumbnails')
      .remove([document.thumbnail_path]);

    if (thumbnailError) {
      console.error('Error deleting thumbnail from storage:', thumbnailError);
      // Continue with deletion even if thumbnail removal fails
    }
  }

  // Delete the document from the database
  const { error } = await this.supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', this.userId);

  if (error) {
    console.error('Error deleting document:', error);
    throw error;
  }

  return true;
}
```

## File Locations
These functions should be added to:
- `lib/supabase-db.ts` - Main implementation of database functions
- `lib/database.ts` - Exports the database service

## Testing
After implementing these functions, test each one to ensure it works correctly:

1. Test `db.getDocuments()` to ensure it returns all documents for the current user
2. Test `db.getDocument(id)` to ensure it returns a specific document
3. Test `db.saveDocument(document)` to ensure it saves a document
4. Test `db.deleteDocument(id)` to ensure it deletes a document and its associated files

## Notes
- Make sure to add proper error handling and validation
- Ensure that all functions include proper user authentication and data isolation
- Consider adding caching for better performance
- The `saveDocument` function should handle both new documents and updates to existing documents
- The `deleteDocument` function should delete both the database record and the associated files in storage
- Update any UI components that display documents to work with the new data structure
