# Task 9: Update API Endpoints for System Settings

## Background
The database schema has been optimized with a new `system_settings` table for global system settings. Now, we need to update the system settings API endpoints to work with the new schema.

## Current Implementation
Currently, the application uses the following system settings endpoints:
- GET /api/settings/processing - Get processing settings
- PUT /api/settings/processing - Update processing settings

These endpoints are implemented in `app/api/settings/processing/route.ts` using Next.js App Router API routes and interact with the `settings` table in the database through the `settingsService` defined in `lib/settings-service.ts`.

## Required Changes

### 1. Update GET /api/settings/processing Endpoint
This endpoint should now query the `system_settings` table.

**Implementation:**
```javascript
// File: app/api/settings/processing/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check if user is authenticated (optional, but useful for logging)
    const { data: { session } } = await supabase.auth.getSession();

    // Get processing settings from system_settings table
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'processing')
      .single();

    if (error) {
      console.error('Error fetching processing settings:', error);
      // Return default settings if there's an error
      return NextResponse.json(
        {
          settings: {
            maxConcurrentJobs: 2,
            pagesPerChunk: 2,
            concurrentChunks: 1,
            retryAttempts: 2,
            retryDelay: 1000
          }
        },
        { status: 200 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

    return NextResponse.json(
      { settings: data?.value || {} },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/settings/processing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Update PUT /api/settings/processing Endpoint
This endpoint should now update the `system_settings` table.

**Implementation:**
```javascript
// File: app/api/settings/processing/route.js
// Add this to the existing file with the GET handler

export async function PUT(request) {
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

    // Check if user is an admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid settings object' },
        { status: 400 }
      );
    }

    // Get current settings to merge with updates
    const { data: currentData, error: currentError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'processing')
      .single();

    if (currentError && currentError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error('Error fetching current processing settings:', currentError);
      return NextResponse.json(
        { error: 'Failed to fetch current settings' },
        { status: 500 }
      );
    }

    const currentSettings = currentData?.value || {
      maxConcurrentJobs: 2,
      pagesPerChunk: 2,
      concurrentChunks: 1,
      retryAttempts: 2,
      retryDelay: 1000
    };

    // Merge current settings with updates
    const updatedSettings = { ...currentSettings, ...settings };

    // Validate settings
    if (typeof updatedSettings.maxConcurrentJobs !== 'number' || updatedSettings.maxConcurrentJobs < 1) {
      return NextResponse.json(
        { error: 'maxConcurrentJobs must be a positive number' },
        { status: 400 }
      );
    }

    if (typeof updatedSettings.pagesPerChunk !== 'number' || updatedSettings.pagesPerChunk < 1) {
      return NextResponse.json(
        { error: 'pagesPerChunk must be a positive number' },
        { status: 400 }
      );
    }

    if (typeof updatedSettings.concurrentChunks !== 'number' || updatedSettings.concurrentChunks < 1) {
      return NextResponse.json(
        { error: 'concurrentChunks must be a positive number' },
        { status: 400 }
      );
    }

    if (typeof updatedSettings.retryAttempts !== 'number' || updatedSettings.retryAttempts < 0) {
      return NextResponse.json(
        { error: 'retryAttempts must be a non-negative number' },
        { status: 400 }
      );
    }

    if (typeof updatedSettings.retryDelay !== 'number' || updatedSettings.retryDelay < 0) {
      return NextResponse.json(
        { error: 'retryDelay must be a non-negative number' },
        { status: 400 }
      );
    }

    // Update settings
    const { data, error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'processing',
        value: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating processing settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { settings: data.value },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/settings/processing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 3. Create GET /api/settings/ocr-defaults Endpoint
This endpoint should retrieve OCR default settings from the system_settings table.

**Implementation:**
```javascript
// File: app/api/settings/ocr-defaults/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check if user is authenticated (optional, but useful for logging)
    const { data: { session } } = await supabase.auth.getSession();

    // Get OCR default settings from system_settings table
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ocr_defaults')
      .single();

    if (error) {
      console.error('Error fetching OCR default settings:', error);
      // Return default settings if there's an error
      return NextResponse.json(
        {
          settings: {
            provider: 'google',
            language: 'en'
          }
        },
        { status: 200 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

    return NextResponse.json(
      { settings: data?.value || {} },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/settings/ocr-defaults:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 4. Create PUT /api/settings/ocr-defaults Endpoint
This endpoint should update OCR default settings in the system_settings table.

**Implementation:**
```javascript
// File: app/api/settings/ocr-defaults/route.js
// Add this to the existing file with the GET handler

export async function PUT(request) {
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

    // Check if user is an admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid settings object' },
        { status: 400 }
      );
    }

    // Get current settings to merge with updates
    const { data: currentData, error: currentError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ocr_defaults')
      .single();

    if (currentError && currentError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error('Error fetching current OCR default settings:', currentError);
      return NextResponse.json(
        { error: 'Failed to fetch current settings' },
        { status: 500 }
      );
    }

    const currentSettings = currentData?.value || {
      provider: 'google',
      language: 'en'
    };

    // Merge current settings with updates
    const updatedSettings = { ...currentSettings, ...settings };

    // Validate settings
    if (typeof updatedSettings.provider !== 'string' || !updatedSettings.provider) {
      return NextResponse.json(
        { error: 'provider must be a non-empty string' },
        { status: 400 }
      );
    }

    if (typeof updatedSettings.language !== 'string' || !updatedSettings.language) {
      return NextResponse.json(
        { error: 'language must be a non-empty string' },
        { status: 400 }
      );
    }

    // Update settings
    const { data, error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'ocr_defaults',
        value: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating OCR default settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { settings: data.value },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/settings/ocr-defaults:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 5. Create GET /api/settings/upload-limits Endpoint
This endpoint should retrieve upload limit settings from the system_settings table.

**Implementation:**
```javascript
// File: app/api/settings/upload-limits/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check if user is authenticated (optional, but useful for logging)
    const { data: { session } } = await supabase.auth.getSession();

    // Get upload limit settings from system_settings table
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'upload_limits')
      .single();

    if (error) {
      console.error('Error fetching upload limit settings:', error);
      // Return default settings if there's an error
      return NextResponse.json(
        {
          settings: {
            maxFileSize: 500,
            allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
            maxSimultaneousUploads: 5
          }
        },
        { status: 200 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

    return NextResponse.json(
      { settings: data?.value || {} },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/settings/upload-limits:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 6. Create PUT /api/settings/upload-limits Endpoint
This endpoint should update upload limit settings in the system_settings table.

**Implementation:**
```javascript
// File: app/api/settings/upload-limits/route.js
// Add this to the existing file with the GET handler

export async function PUT(request) {
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

    // Check if user is an admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid settings object' },
        { status: 400 }
      );
    }

    // Get current settings to merge with updates
    const { data: currentData, error: currentError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'upload_limits')
      .single();

    if (currentError && currentError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error('Error fetching current upload limit settings:', currentError);
      return NextResponse.json(
        { error: 'Failed to fetch current settings' },
        { status: 500 }
      );
    }

    const currentSettings = currentData?.value || {
      maxFileSize: 500,
      allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
      maxSimultaneousUploads: 5
    };

    // Merge current settings with updates
    const updatedSettings = { ...currentSettings, ...settings };

    // Validate settings
    if (typeof updatedSettings.maxFileSize !== 'number' || updatedSettings.maxFileSize <= 0) {
      return NextResponse.json(
        { error: 'maxFileSize must be a positive number' },
        { status: 400 }
      );
    }

    if (!Array.isArray(updatedSettings.allowedFileTypes) || updatedSettings.allowedFileTypes.length === 0) {
      return NextResponse.json(
        { error: 'allowedFileTypes must be a non-empty array' },
        { status: 400 }
      );
    }

    if (typeof updatedSettings.maxSimultaneousUploads !== 'number' || updatedSettings.maxSimultaneousUploads <= 0) {
      return NextResponse.json(
        { error: 'maxSimultaneousUploads must be a positive number' },
        { status: 400 }
      );
    }

    // Update settings
    const { data, error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'upload_limits',
        value: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating upload limit settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { settings: data.value },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/settings/upload-limits:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## File Locations
These endpoints should be updated or created in the following files:
- `app/api/settings/processing/route.ts` - For GET and PUT /api/settings/processing (update existing file)
- `app/api/settings/ocr-defaults/route.ts` - For GET and PUT /api/settings/ocr-defaults (create new file)
- `app/api/settings/upload-limits/route.ts` - For GET and PUT /api/settings/upload-limits (create new file)

Note that the application uses TypeScript, so the files should have the `.ts` extension. The existing implementation for processing settings can be found in `app/api/settings/processing/route.ts`.

## Testing
After implementing these changes, test each endpoint to ensure it works correctly:

1. Test GET /api/settings/processing to ensure it returns processing settings
2. Test PUT /api/settings/processing to ensure it updates processing settings (admin only)
3. Test GET /api/settings/ocr-defaults to ensure it returns OCR default settings
4. Test PUT /api/settings/ocr-defaults to ensure it updates OCR default settings (admin only)
5. Test GET /api/settings/upload-limits to ensure it returns upload limit settings
6. Test PUT /api/settings/upload-limits to ensure it updates upload limit settings (admin only)

## Notes
- Make sure to add proper error handling and validation
- Ensure that all update endpoints include proper authentication and admin-only access checks
- Set appropriate cache headers for GET requests
- The GET endpoints should return default values if the settings are not found in the database
- The PUT endpoints should validate the settings before updating them
- Update any UI components that interact with these endpoints to work with the new data structure
- These endpoints now work with the `system_settings` table instead of the `settings` table, but maintain similar API interfaces for backward compatibility
