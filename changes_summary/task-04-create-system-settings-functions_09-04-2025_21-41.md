# Task 4: Create System Settings Functions

## Background
The database schema has been optimized with a new `system_settings` table for global system settings. We need to create new system settings functions to work with this table.

## Current Implementation
Currently, the application uses a `settings` table for system-wide settings. The settings functions include:
- `settingsService.getProcessingSettings()` - Gets processing settings
- `settingsService.updateProcessingSettings(settings)` - Updates processing settings

These functions are implemented in `lib/settings-service.ts` and are used to retrieve and update global processing settings.

## New Database Schema
In the new schema, the `system_settings` table has a more structured format:

```sql
CREATE TABLE public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    is_editable BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

The table has been initialized with default values:

```sql
INSERT INTO public.system_settings (key, value, is_editable)
VALUES
('processing', '{"maxConcurrentJobs": 2, "pagesPerChunk": 2, "concurrentChunks": 1, "retryAttempts": 2, "retryDelay": 1000}', true),
('ocr_defaults', '{"provider": "google", "language": "en"}', true),
('upload_limits', '{"maxFileSize": 500, "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"], "maxSimultaneousUploads": 5}', true)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
```

## Required Functions

### 1. Create `systemSettingsService.getProcessingSettings()`
This function should retrieve processing settings from the system_settings table.

**Implementation:**
```javascript
import { createClient } from '@supabase/supabase-js';

class SystemSettingsService {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async getProcessingSettings() {
    // Check cache first
    const cacheKey = 'processing_settings';
    const cachedSettings = this.cache.get(cacheKey);

    if (cachedSettings && cachedSettings.timestamp > Date.now() - this.cacheTTL) {
      return cachedSettings.data;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'processing')
      .single();

    if (error) {
      console.error('Error fetching processing settings:', error);
      // Return default settings if there's an error
      return {
        maxConcurrentJobs: 2,
        pagesPerChunk: 2,
        concurrentChunks: 1,
        retryAttempts: 2,
        retryDelay: 1000
      };
    }

    const settings = data?.value || {
      maxConcurrentJobs: 2,
      pagesPerChunk: 2,
      concurrentChunks: 1,
      retryAttempts: 2,
      retryDelay: 1000
    };

    // Update cache
    this.cache.set(cacheKey, {
      data: settings,
      timestamp: Date.now()
    });

    return settings;
  }
}

export const systemSettingsService = new SystemSettingsService();
```

### 2. Create `systemSettingsService.updateProcessingSettings(settings)`
This function should update processing settings in the system_settings table.

**Implementation:**
```javascript
async updateProcessingSettings(settings) {
  // Validate settings
  if (!settings || typeof settings !== 'object') {
    throw new Error('Invalid settings object');
  }

  // Get current settings to merge with updates
  const currentSettings = await this.getProcessingSettings();
  const updatedSettings = { ...currentSettings, ...settings };

  // Update in database
  const { data, error } = await this.supabase
    .from('system_settings')
    .update({
      value: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('key', 'processing')
    .select()
    .single();

  if (error) {
    console.error('Error updating processing settings:', error);
    throw error;
  }

  // Clear cache
  this.cache.delete('processing_settings');

  return data?.value || updatedSettings;
}
```

### 3. Create `systemSettingsService.getOCRDefaults()`
This function should retrieve OCR default settings from the system_settings table.

**Implementation:**
```javascript
async getOCRDefaults() {
  // Check cache first
  const cacheKey = 'ocr_defaults';
  const cachedSettings = this.cache.get(cacheKey);

  if (cachedSettings && cachedSettings.timestamp > Date.now() - this.cacheTTL) {
    return cachedSettings.data;
  }

  // Fetch from database
  const { data, error } = await this.supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'ocr_defaults')
    .single();

  if (error) {
    console.error('Error fetching OCR defaults:', error);
    // Return default settings if there's an error
    return {
      provider: 'google',
      language: 'en'
    };
  }

  const settings = data?.value || {
    provider: 'google',
    language: 'en'
  };

  // Update cache
  this.cache.set(cacheKey, {
    data: settings,
    timestamp: Date.now()
  });

  return settings;
}
```

### 4. Create `systemSettingsService.updateOCRDefaults(settings)`
This function should update OCR default settings in the system_settings table.

**Implementation:**
```javascript
async updateOCRDefaults(settings) {
  // Validate settings
  if (!settings || typeof settings !== 'object') {
    throw new Error('Invalid settings object');
  }

  // Get current settings to merge with updates
  const currentSettings = await this.getOCRDefaults();
  const updatedSettings = { ...currentSettings, ...settings };

  // Update in database
  const { data, error } = await this.supabase
    .from('system_settings')
    .update({
      value: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('key', 'ocr_defaults')
    .select()
    .single();

  if (error) {
    console.error('Error updating OCR defaults:', error);
    throw error;
  }

  // Clear cache
  this.cache.delete('ocr_defaults');

  return data?.value || updatedSettings;
}
```

### 5. Create `systemSettingsService.getUploadLimits()`
This function should retrieve upload limit settings from the system_settings table.

**Implementation:**
```javascript
async getUploadLimits() {
  // Check cache first
  const cacheKey = 'upload_limits';
  const cachedSettings = this.cache.get(cacheKey);

  if (cachedSettings && cachedSettings.timestamp > Date.now() - this.cacheTTL) {
    return cachedSettings.data;
  }

  // Fetch from database
  const { data, error } = await this.supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'upload_limits')
    .single();

  if (error) {
    console.error('Error fetching upload limits:', error);
    // Return default settings if there's an error
    return {
      maxFileSize: 500,
      allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
      maxSimultaneousUploads: 5
    };
  }

  const settings = data?.value || {
    maxFileSize: 500,
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
    maxSimultaneousUploads: 5
  };

  // Update cache
  this.cache.set(cacheKey, {
    data: settings,
    timestamp: Date.now()
  });

  return settings;
}
```

### 6. Create `systemSettingsService.updateUploadLimits(settings)`
This function should update upload limit settings in the system_settings table.

**Implementation:**
```javascript
async updateUploadLimits(settings) {
  // Validate settings
  if (!settings || typeof settings !== 'object') {
    throw new Error('Invalid settings object');
  }

  // Get current settings to merge with updates
  const currentSettings = await this.getUploadLimits();
  const updatedSettings = { ...currentSettings, ...settings };

  // Update in database
  const { data, error } = await this.supabase
    .from('system_settings')
    .update({
      value: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('key', 'upload_limits')
    .select()
    .single();

  if (error) {
    console.error('Error updating upload limits:', error);
    throw error;
  }

  // Clear cache
  this.cache.delete('upload_limits');

  return data?.value || updatedSettings;
}
```

## File Locations
These functions should be added to a new system settings service file:
- `lib/system-settings-service.ts` - New file for system settings functions

The existing settings service in `lib/settings-service.ts` should be updated to use the new system settings service for backward compatibility.

## Testing
After implementing these functions, test each one to ensure it works correctly:

1. Test `systemSettingsService.getProcessingSettings()` to ensure it returns processing settings
2. Test `systemSettingsService.updateProcessingSettings(settings)` to ensure it updates processing settings
3. Test `systemSettingsService.getOCRDefaults()` to ensure it returns OCR default settings
4. Test `systemSettingsService.updateOCRDefaults(settings)` to ensure it updates OCR default settings
5. Test `systemSettingsService.getUploadLimits()` to ensure it returns upload limit settings
6. Test `systemSettingsService.updateUploadLimits(settings)` to ensure it updates upload limit settings

## Notes
- Make sure to add proper error handling and validation
- Consider adding caching for better performance (as shown in the implementations)
- The system settings should be accessible to all users, but only admins should be able to update them
- In production, the update functions should be protected with admin-only access
- The Row Level Security policies for the system_settings table are already set up to allow only admins to update the settings
