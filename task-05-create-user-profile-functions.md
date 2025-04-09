# Task 5: Create User Profile Functions

## Background
The database schema has been optimized with a `user_profiles` table for user profile information. We need to create new user profile functions to work with this table.

## Current Implementation
Currently, the application doesn't have dedicated user profile management functions. User authentication is handled through Supabase Auth, but there's no specific user profile management beyond the basic auth functionality. The application uses `lib/auth.ts` for authentication-related functions.

## New Database Schema
In the new schema, the `user_profiles` table stores user profile information:

```sql
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    organization TEXT,
    role TEXT DEFAULT 'user',
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

A trigger has been set up to automatically create a user profile when a new user signs up:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into user_profiles
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email);

  -- Insert into user_settings with default values
  INSERT INTO public.user_settings (id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Required Functions

### 1. Create `userProfileService.getProfile()`
This function should retrieve the user profile from the user_profiles table.

**Implementation:**
```javascript
import { createClient } from '@supabase/supabase-js';

class UserProfileService {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async getCurrentUser() {
    const { data: { session }, error } = await this.supabase.auth.getSession();

    if (error || !session) {
      console.error('Error getting current user:', error);
      throw new Error('Not authenticated');
    }

    return session.user;
  }

  async getProfile() {
    try {
      const user = await this.getCurrentUser();

      // Check cache first
      const cacheKey = `profile_${user.id}`;
      const cachedProfile = this.cache.get(cacheKey);

      if (cachedProfile && cachedProfile.timestamp > Date.now() - this.cacheTTL) {
        return cachedProfile.data;
      }

      // Fetch from database
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        throw error;
      }

      if (!data) {
        // If profile doesn't exist, create a new one
        return this.createDefaultProfile(user);
      }

      // Update cache
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error('Error in getProfile:', error);
      throw error;
    }
  }

  async createDefaultProfile(user) {
    const defaultProfile = {
      id: user.id,
      email: user.email,
      full_name: '',
      avatar_url: '',
      organization: '',
      role: 'user',
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('user_profiles')
      .insert(defaultProfile)
      .select()
      .single();

    if (error) {
      console.error('Error creating default profile:', error);
      throw error;
    }

    // Update cache
    this.cache.set(`profile_${user.id}`, {
      data: data || defaultProfile,
      timestamp: Date.now()
    });

    return data || defaultProfile;
  }
}

export const userProfileService = new UserProfileService();
```

### 2. Create `userProfileService.updateProfile(profile)`
This function should update the user profile in the user_profiles table.

**Implementation:**
```javascript
async updateProfile(profile) {
  try {
    const user = await this.getCurrentUser();

    // Validate profile
    if (!profile || typeof profile !== 'object') {
      throw new Error('Invalid profile object');
    }

    // Get current profile to merge with updates
    const currentProfile = await this.getProfile();

    // Prepare updates (only allow updating certain fields)
    const updates = {
      full_name: profile.full_name !== undefined ? profile.full_name : currentProfile.full_name,
      avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : currentProfile.avatar_url,
      organization: profile.organization !== undefined ? profile.organization : currentProfile.organization,
      preferences: profile.preferences ? { ...currentProfile.preferences, ...profile.preferences } : currentProfile.preferences,
      updated_at: new Date().toISOString()
    };

    // Update in database
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }

    // Clear cache
    this.cache.delete(`profile_${user.id}`);

    return data;
  } catch (error) {
    console.error('Error in updateProfile:', error);
    throw error;
  }
}
```

### 3. Create `userProfileService.getProfileById(id)`
This function should retrieve a user profile by ID (for admin use).

**Implementation:**
```javascript
async getProfileById(id) {
  try {
    const user = await this.getCurrentUser();

    // Check if user is an admin
    const { data: adminCheck, error: adminError } = await this.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminCheck || adminCheck.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    // Fetch profile
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user profile by ID:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getProfileById:', error);
    throw error;
  }
}
```

### 4. Create `userProfileService.updateProfileById(id, profile)`
This function should update a user profile by ID (for admin use).

**Implementation:**
```javascript
async updateProfileById(id, profile) {
  try {
    const user = await this.getCurrentUser();

    // Check if user is an admin
    const { data: adminCheck, error: adminError } = await this.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminCheck || adminCheck.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    // Validate profile
    if (!profile || typeof profile !== 'object') {
      throw new Error('Invalid profile object');
    }

    // Get current profile to merge with updates
    const { data: currentProfile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileError || !currentProfile) {
      throw new Error('Profile not found');
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

    // Update in database
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile by ID:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateProfileById:', error);
    throw error;
  }
}
```

### 5. Create `userProfileService.getAllProfiles()`
This function should retrieve all user profiles (for admin use).

**Implementation:**
```javascript
async getAllProfiles() {
  try {
    const user = await this.getCurrentUser();

    // Check if user is an admin
    const { data: adminCheck, error: adminError } = await this.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminCheck || adminCheck.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    // Fetch all profiles
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all user profiles:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllProfiles:', error);
    throw error;
  }
}
```

## File Locations
These functions should be added to a new user profile service file:
- `lib/user-profile-service.ts` - New file for user profile management functions

This follows the pattern of other service files in the application like `lib/user-settings-service.ts` and `lib/settings-service.ts`.

## Testing
After implementing these functions, test each one to ensure it works correctly:

1. Test `userProfileService.getProfile()` to ensure it returns the current user's profile
2. Test `userProfileService.updateProfile(profile)` to ensure it updates the current user's profile
3. Test `userProfileService.getProfileById(id)` to ensure it returns a user profile by ID (admin only)
4. Test `userProfileService.updateProfileById(id, profile)` to ensure it updates a user profile by ID (admin only)
5. Test `userProfileService.getAllProfiles()` to ensure it returns all user profiles (admin only)

## Notes
- Make sure to add proper error handling and validation
- Ensure that all functions include proper user authentication and data isolation
- Consider adding caching for better performance (as shown in the implementations)
- The admin-only functions should be properly secured to prevent unauthorized access
- The trigger function will automatically create a user profile when a new user signs up, but the getProfile function includes a fallback to create a profile if one doesn't exist
- Regular users should only be able to update their own profiles, while admins can update any profile
