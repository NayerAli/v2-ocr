# Task 6: Update API Endpoints for Document Management

## Background
The database schema has been optimized with a new `documents` table that serves as the main table for document storage and processing status. We need to create new API endpoints for document management to work with this table.

## Current Implementation
Currently, the application doesn't have dedicated document management endpoints. It uses the queue endpoints for document management. The existing API endpoints are implemented in the `app/api` directory using Next.js App Router API routes.

## Required Endpoints

### 1. Create GET /api/documents Endpoint
This endpoint should retrieve all documents for the current user.

**Implementation:**
```javascript
// File: app/api/documents/route.js
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

    // Get documents
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=60');

    return NextResponse.json(
      { documents: data || [] },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/documents:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Create GET /api/documents/:id Endpoint
This endpoint should retrieve a specific document.

**Implementation:**
```javascript
// File: app/api/documents/[id]/route.js
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

    // Get document
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      console.error('Error fetching document:', error);
      return NextResponse.json(
        { error: 'Failed to fetch document' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=60');

    return NextResponse.json(
      { document: data },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/documents/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 3. Create POST /api/documents Endpoint
This endpoint should upload a new document.

**Implementation:**
```javascript
// File: app/api/documents/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

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

    // Create document record
    const document = {
      id: uniqueId,
      user_id: session.user.id,
      filename: uniqueFileName,
      original_filename: fileName,
      file_size: file.size,
      file_type: fileType,
      storage_path: storagePath,
      status: 'pending',
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
      console.error('Error creating document record:', error);

      // Clean up storage if database insert fails
      await supabase
        .storage
        .from('documents')
        .remove([storagePath]);

      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { document: data },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/documents:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 4. Create DELETE /api/documents/:id Endpoint
This endpoint should delete a document.

**Implementation:**
```javascript
// File: app/api/documents/[id]/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Add this to the existing file with the GET handler

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
      .select('id, storage_path, thumbnail_path')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Document not found or not owned by user' },
        { status: 404 }
      );
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
    console.error('Error in DELETE /api/documents/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## File Locations
These endpoints should be created in the following files:
- `app/api/documents/route.ts` - For GET and POST /api/documents
- `app/api/documents/[id]/route.ts` - For GET and DELETE /api/documents/:id

Note that the application uses TypeScript, so the files should have the `.ts` extension.

## Testing
After implementing these endpoints, test each one to ensure it works correctly:

1. Test GET /api/documents to ensure it returns all documents for the current user
2. Test GET /api/documents/:id to ensure it returns a specific document
3. Test POST /api/documents to ensure it uploads a new document
4. Test DELETE /api/documents/:id to ensure it deletes a document and its associated files

## Notes
- Make sure to add proper error handling and validation
- Ensure that all endpoints include proper authentication checks
- Set appropriate cache headers for GET requests
- The POST endpoint should validate the file type and size based on user settings
- The DELETE endpoint should delete both the database record and the associated files in storage
- Consider adding pagination for the GET /api/documents endpoint if users may have many documents
- Update any UI components that interact with these endpoints to work with the new data structure
