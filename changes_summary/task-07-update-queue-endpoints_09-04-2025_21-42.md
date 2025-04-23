# Task 7: Update API Endpoints for Queue Management

## Background
The database schema has been optimized, and the `queue` table has been merged into the `documents` table. Now, we need to update all queue-related API endpoints to work with the new schema.

## Current Implementation
Currently, the application uses the following queue-related endpoints:
- GET /api/queue - Get the processing queue for the current user
- POST /api/queue - Add a document to the queue
- POST /api/queue/:id/cancel - Cancel processing for a document
- DELETE /api/queue/:id/delete - Remove a document from the queue

## Required Changes

### 1. Update GET /api/queue Endpoint
This endpoint should now query the `documents` table with status filtering.

**Implementation:**
```javascript
// File: app/api/queue/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get queue items (documents with specific statuses)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', session.user.id)
      .in('status', ['pending', 'processing', 'queued'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching queue:', error);
      return NextResponse.json(
        { error: 'Failed to fetch queue' },
        { status: 500 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=10'); // Short cache time for queue

    return NextResponse.json(
      { queue: data || [] },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/queue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Update POST /api/queue Endpoint
This endpoint should now insert into the `documents` table with status='queued'.

**Implementation:**
```javascript
// File: app/api/queue/route.js
// Add this to the existing file with the GET handler

export async function POST(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user settings for upload limits
    const { data: userSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('upload_settings')
      .eq('id', session.user.id)
      .single();

    if (settingsError) {
      console.error('Error fetching user settings:', settingsError);
      return NextResponse.json(
        { error: 'Failed to fetch user settings' },
        { status: 500 }
      );
    }

    const uploadSettings = userSettings?.upload_settings || {
      maxFileSize: 500,
      allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
      maxSimultaneousUploads: 5
    };

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name;
    const fileType = fileName.substring(fileName.lastIndexOf('.'));

    if (!uploadSettings.allowedFileTypes.includes(fileType.toLowerCase())) {
      return NextResponse.json(
        { error: `File type not allowed. Allowed types: ${uploadSettings.allowedFileTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size (convert MB to bytes)
    const maxSizeBytes = uploadSettings.maxFileSize * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${uploadSettings.maxFileSize}MB` },
        { status: 400 }
      );
    }

    // Generate a unique filename
    const uniqueId = uuidv4();
    const uniqueFileName = `${uniqueId}${fileType}`;
    const storagePath = `${session.user.id}/${uniqueFileName}`;

    // Upload file to storage
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('documents')
      .upload(storagePath, file);

    if (storageError) {
      console.error('Error uploading file to storage:', storageError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Create document record with status='queued'
    const document = {
      id: uniqueId,
      user_id: session.user.id,
      filename: uniqueFileName,
      original_filename: fileName,
      file_size: file.size,
      file_type: fileType,
      storage_path: storagePath,
      status: 'queued', // Set status to queued
      metadata: {
        uploadedFrom: 'api',
        contentType: file.type
      }
    };

    const { data, error } = await supabase
      .from('documents')
      .insert(document)
      .select()
      .single();

    if (error) {
      console.error('Error creating queue item:', error);

      // Clean up storage if database insert fails
      await supabase
        .storage
        .from('documents')
        .remove([storagePath]);

      return NextResponse.json(
        { error: 'Failed to create queue item' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { queueItem: data },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/queue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 3. Update POST /api/queue/:id/cancel Endpoint
This endpoint should now update the `documents` table with status='cancelled'.

**Implementation:**
```javascript
// File: app/api/queue/[id]/cancel/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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

    // Get document to check ownership and current status
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      );
    }

    // Check if document is in a cancellable state
    const cancellableStatuses = ['pending', 'processing', 'queued'];
    if (!cancellableStatuses.includes(document.status)) {
      return NextResponse.json(
        { error: `Cannot cancel document with status: ${document.status}` },
        { status: 400 }
      );
    }

    // Update document status to cancelled
    const { data, error } = await supabase
      .from('documents')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error cancelling document:', error);
      return NextResponse.json(
        { error: 'Failed to cancel document' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Document cancelled successfully', document: data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in POST /api/queue/[id]/cancel:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 4. Update DELETE /api/queue/:id/delete Endpoint
This endpoint should now delete from the `documents` table.

**Implementation:**
```javascript
// File: app/api/queue/[id]/delete/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
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

    // Get document to check ownership and get storage paths
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id, storage_path, thumbnail_path, status')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      );
    }

    // If document is processing, cancel it first
    if (document.status === 'processing') {
      const { error: cancelError } = await supabase
        .from('documents')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (cancelError) {
        console.error('Error cancelling document:', cancelError);
        // Continue with deletion even if cancellation fails
      }
    }

    // Delete the document from storage if it exists
    if (document.storage_path) {
      const { error: storageError } = await supabase
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
      const { error: thumbnailError } = await supabase
        .storage
        .from('thumbnails')
        .remove([document.thumbnail_path]);

      if (thumbnailError) {
        console.error('Error deleting thumbnail from storage:', thumbnailError);
        // Continue with deletion even if thumbnail removal fails
      }
    }

    // Delete the document from the database
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error deleting document:', error);
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Document deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in DELETE /api/queue/[id]/delete:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## File Locations
These endpoints should be updated in the following files:
- `app/api/queue/route.ts` - For GET and POST /api/queue
- `app/api/queue/[id]/cancel/route.ts` - For POST /api/queue/:id/cancel
- `app/api/queue/[id]/delete/route.ts` - For DELETE /api/queue/:id/delete

Note that the application uses TypeScript, so the files have the `.ts` extension. The existing implementations can be found in these files.

## Testing
After implementing these changes, test each endpoint to ensure it works correctly:

1. Test GET /api/queue to ensure it returns documents with the correct statuses
2. Test POST /api/queue to ensure it adds a document to the queue with status='queued'
3. Test POST /api/queue/:id/cancel to ensure it updates a document's status to 'cancelled'
4. Test DELETE /api/queue/:id/delete to ensure it deletes a document and its associated files

## Notes
- Make sure to add proper error handling and validation
- Ensure that all endpoints include proper authentication checks
- Set appropriate cache headers for GET requests
- The POST endpoint should validate the file type and size based on user settings
- The DELETE endpoint should delete both the database record and the associated files in storage
- Consider adding pagination for the GET /api/queue endpoint if users may have many documents in the queue
- Update any UI components that interact with these endpoints to work with the new data structure
- These endpoints now work with the `documents` table instead of the `queue` table, but maintain the same API interface for backward compatibility
