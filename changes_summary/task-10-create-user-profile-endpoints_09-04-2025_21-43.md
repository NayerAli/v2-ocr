# Task 10: Create API Endpoints for User Profile Management

## Background
The database schema has been optimized with a `user_profiles` table for user profile information. We need to create new API endpoints for user profile management to work with this table.

## Current Implementation
Currently, the application doesn't have dedicated user profile management endpoints. User authentication is handled through Supabase Auth, and there are endpoints for user settings in `app/api/settings/user/route.ts`, but no specific endpoints for managing user profiles.

## Required Endpoints

### 1. Create GET /api/user/profile Endpoint
This endpoint should retrieve the current user's profile.

**Implementation:**
```javascript
// File: app/api/user/profile/route.js
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

    // Get user profile
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    if (!data) {
      // If profile doesn't exist, create a default one
      const defaultProfile = {
        id: session.user.id,
        email: session.user.email,
        full_name: '',
        avatar_url: '',
        organization: '',
        role: 'user',
        preferences: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert(defaultProfile)
        .select()
        .single();

      if (insertError) {
        console.error('Error creating default profile:', insertError);
        return NextResponse.json(
          { error: 'Failed to create user profile' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { profile: newProfile || defaultProfile },
        { status: 200 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=60'); // Cache for 1 minute

    return NextResponse.json(
      { profile: data },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/user/profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Create PUT /api/user/profile Endpoint
This endpoint should update the current user's profile.

**Implementation:**
```javascript
// File: app/api/user/profile/route.js
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

    // Parse request body
    const body = await request.json();
    const { profile } = body;

    if (!profile || typeof profile !== 'object') {
      return NextResponse.json(
        { error: 'Invalid profile object' },
        { status: 400 }
      );
    }

    // Get current profile
    const { data: currentProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error('Error fetching current profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch current profile' },
        { status: 500 }
      );
    }

    // Prepare updates (only allow updating certain fields)
    const updates = {
      full_name: profile.full_name !== undefined ? profile.full_name : (currentProfile?.full_name || ''),
      avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : (currentProfile?.avatar_url || ''),
      organization: profile.organization !== undefined ? profile.organization : (currentProfile?.organization || ''),
      preferences: profile.preferences ? { ...(currentProfile?.preferences || {}), ...profile.preferences } : (currentProfile?.preferences || {}),
      updated_at: new Date().toISOString()
    };

    // If profile doesn't exist, create it
    if (!currentProfile) {
      updates.id = session.user.id;
      updates.email = session.user.email;
      updates.role = 'user';
      updates.created_at = new Date().toISOString();
    }

    // Update profile
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: session.user.id,
        ...updates
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { profile: data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/user/profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 3. Create GET /api/admin/users Endpoint (Admin Only)
This endpoint should retrieve all user profiles for admin use.

**Implementation:**
```javascript
// File: app/api/admin/users/route.js
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

    // Get query parameters for pagination
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // Calculate range
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Get all user profiles with pagination
    const { data, error, count } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching user profiles:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user profiles' },
        { status: 500 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=60'); // Cache for 1 minute

    return NextResponse.json(
      {
        users: data || [],
        pagination: {
          page,
          pageSize,
          totalItems: count,
          totalPages: Math.ceil(count / pageSize)
        }
      },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 4. Create GET /api/admin/users/:id Endpoint (Admin Only)
This endpoint should retrieve a specific user profile for admin use.

**Implementation:**
```javascript
// File: app/api/admin/users/[id]/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Get user profile
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'private, max-age=60'); // Cache for 1 minute

    return NextResponse.json(
      { profile: data },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error('Error in GET /api/admin/users/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 5. Create PUT /api/admin/users/:id Endpoint (Admin Only)
This endpoint should update a specific user profile for admin use.

**Implementation:**
```javascript
// File: app/api/admin/users/[id]/route.js
// Add this to the existing file with the GET handler

export async function PUT(request, { params }) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
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
    const { profile } = body;

    if (!profile || typeof profile !== 'object') {
      return NextResponse.json(
        { error: 'Invalid profile object' },
        { status: 400 }
      );
    }

    // Get current profile
    const { data: currentProfile, error: currentProfileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (currentProfileError) {
      console.error('Error fetching current profile:', currentProfileError);
      return NextResponse.json(
        { error: 'Failed to fetch current profile' },
        { status: 500 }
      );
    }

    if (!currentProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prepare updates (admins can update all fields)
    const updates = {
      full_name: profile.full_name !== undefined ? profile.full_name : currentProfile.full_name,
      avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : currentProfile.avatar_url,
      organization: profile.organization !== undefined ? profile.organization : currentProfile.organization,
      role: profile.role !== undefined ? profile.role : currentProfile.role,
      preferences: profile.preferences ? { ...currentProfile.preferences, ...profile.preferences } : currentProfile.preferences,
      updated_at: new Date().toISOString()
    };

    // Update profile
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { profile: data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/admin/users/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## File Locations
These endpoints should be created in the following files:
- `app/api/user/profile/route.ts` - For GET and PUT /api/user/profile
- `app/api/admin/users/route.ts` - For GET /api/admin/users
- `app/api/admin/users/[id]/route.ts` - For GET and PUT /api/admin/users/:id

Note that the application uses TypeScript, so the files should have the `.ts` extension. These files should follow the pattern of other API endpoints in the application, like `app/api/settings/user/route.ts`.

## Testing
After implementing these endpoints, test each one to ensure it works correctly:

1. Test GET /api/user/profile to ensure it returns the current user's profile
2. Test PUT /api/user/profile to ensure it updates the current user's profile
3. Test GET /api/admin/users to ensure it returns all user profiles (admin only)
4. Test GET /api/admin/users/:id to ensure it returns a specific user profile (admin only)
5. Test PUT /api/admin/users/:id to ensure it updates a specific user profile (admin only)

## Notes
- Make sure to add proper error handling and validation
- Ensure that all endpoints include proper authentication checks
- Set appropriate cache headers for GET requests
- The admin-only endpoints should be properly secured to prevent unauthorized access
- The GET /api/user/profile endpoint includes a fallback to create a profile if one doesn't exist
- Regular users should only be able to update their own profiles, while admins can update any profile
- Consider adding filtering and searching capabilities to the GET /api/admin/users endpoint for better usability
- Update any UI components that interact with these endpoints to work with the new data structure
