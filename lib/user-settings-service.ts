import { getUser } from './auth'
import { isSupabaseConfigured } from './supabase-client'
import { getSupabaseClient } from './supabase/singleton-client'
import type { OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings } from '@/types/settings'
import { CONFIG } from '@/config/constants'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Import the service client for admin operations
// This is only used on the server side
let getServiceClient: () => SupabaseClient<Database> | null = () => null
if (typeof window === 'undefined') {
  // Only import on the server side
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getServiceClient: getServiceClientFn } = require('./supabase/service-client')
  getServiceClient = getServiceClientFn
}

// Default settings
const DEFAULT_OCR_SETTINGS: OCRSettings = {
  provider: "google" as const,
  apiKey: process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || "",
  region: "",
  language: CONFIG.DEFAULT_LANGUAGE,
  useSystemKey: true, // Flag to indicate using the system API key
}

const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 3,
  pagesPerChunk: 3,
  concurrentChunks: 3,
  retryAttempts: 2,
  retryDelay: 1000,
  pagesPerBatch: 3
}

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxFileSize: 500,
  allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
  maxSimultaneousUploads: 5
}

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  theme: 'system',
  fontSize: 14,
  showConfidenceScores: true,
  highlightUncertain: true
}

/**
 * Service for managing user-specific settings in Supabase
 */
class UserSettingsService {
  private cache: {
    ocr: OCRSettings | null
    processing: ProcessingSettings | null
    upload: UploadSettings | null
    display: DisplaySettings | null
  } = {
    ocr: null,
    processing: null,
    upload: null,
    display: null
  }

  private lastUpdate = 0
  private readonly CACHE_TTL = 60000 // 1 minute cache
  private userId: string | null = null

  constructor() {
    // Constructor
  }

  /**
   * Set the user ID for server-side operations
   * This is used when the user ID is known from the server context
   */
  setUserId(userId: string) {
    this.userId = userId;
    console.log('UserSettingsService: User ID set to', userId);
  }

  /**
   * Get the current user for server-side operations
   * This is used when we need access to the user object in server context
   */
  async getUser() {
    return this.getCurrentUser();
  }

  /**
   * Helper method to get the current user
   */
  private async getCurrentUser() {
    // If userId is set (from server-side), create a minimal user object
    if (this.userId) {
      console.log('Using server-provided user ID:', this.userId);
      return { id: this.userId };
    }

    // Otherwise, get the user from auth
    let user = null;
    try {
      user = await getUser();
      if (user) {
        console.log('Got user:', user.email);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }

    if (!user) {
      console.log('No authenticated user found');
    }

    return user;
  }

  /**
   * Get the current user's OCR settings
   */
  async getOCRSettings(): Promise<OCRSettings> {
    const now = Date.now()
    if (this.cache.ocr && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.ocr
    }

    if (!isSupabaseConfigured()) {
      return DEFAULT_OCR_SETTINGS
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('No authenticated user found, using default OCR settings');
      return DEFAULT_OCR_SETTINGS;
    }

    try {
      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      let data, error;

      if (serviceClient) {
        console.log('[DEBUG] Using service client to fetch OCR settings');
        // Use service client to bypass RLS policies
        ({ data, error } = await serviceClient
          .from('user_settings')
          .select('ocr_settings')
          .eq('id', user.id)
          .maybeSingle());
      } else {
        // Fall back to authenticated client
        console.log('[DEBUG] Using authenticated client to fetch OCR settings');
        const authenticatedSupabase = getSupabaseClient();
        ({ data, error } = await authenticatedSupabase
          .from('user_settings')
          .select('ocr_settings')
          .eq('id', user.id)
          .maybeSingle());
      }

      if (error) {
        console.log('[DEBUG] Error fetching OCR settings:', error);
        console.log('[DEBUG] User OCR settings not found due to error, using defaults');
        return DEFAULT_OCR_SETTINGS;
      }

      if (!data) {
        console.log('[DEBUG] User OCR settings not found (no data), using defaults');
        
        // Try to create default settings if they don't exist
        this.createDefaultSettings().catch(err => {
          console.error('[DEBUG] Error creating default settings:', err);
        });
        
        return DEFAULT_OCR_SETTINGS;
      }

      console.log('[DEBUG] Successfully retrieved OCR settings from database:', JSON.stringify(data));

      // Update cache
      this.cache.ocr = data.ocr_settings as OCRSettings;
      this.lastUpdate = now;
      return data.ocr_settings as OCRSettings;
    } catch (error) {
      console.error('Error getting user OCR settings:', error)
      return DEFAULT_OCR_SETTINGS
    }
  }

  /**
   * Update the current user's OCR settings
   * @returns The updated settings if successful, or null if there was an error
   */
  async updateOCRSettings(settings: Partial<OCRSettings>): Promise<OCRSettings | null> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping OCR settings update');
      return null;
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping OCR settings update');
      return null;
    }

    try {
      console.log('[DEBUG] Updating OCR settings for user:', user.id);

      // Get current settings
      const currentSettings = await this.getOCRSettings()

      // Update settings
      const updatedSettings = {
        ...currentSettings,
        ...settings
      }

      console.log('[DEBUG] Updated OCR settings:', updatedSettings);

      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      
      // Get the authenticated Supabase client as fallback
      const authenticatedSupabase = getSupabaseClient();
      
      // Determine which client to use
      const client = serviceClient || authenticatedSupabase;
      
      if (serviceClient) {
        console.log('[DEBUG] Using service client for OCR settings update (bypasses RLS)');
      } else {
        console.log('[DEBUG] Using authenticated client for OCR settings update');
      }

      // Variable to track errors across try/catch blocks
      let operationError = null;
      let success = false;

      try {
        // First check if the user has a settings record
        const { data: existingSettings, error: checkError } = await client
          .from('user_settings')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (checkError) {
          console.error('[DEBUG] Error checking for existing user settings:', checkError);
          // Continue anyway - we'll try to insert/update
        }

        // Prepare the data for insert or update
        const settingsData = {
          ocr_settings: updatedSettings,
          updated_at: new Date().toISOString()
        };

        if (!existingSettings) {
          console.log('[DEBUG] No existing settings found, creating new record');
          // Add additional fields for new records
          const insertData = {
            ...settingsData,
            id: user.id,
            created_at: new Date().toISOString()
          };

          // Create a new record if one doesn't exist
          console.log('[DEBUG] Inserting new user settings with data:', JSON.stringify(insertData));
          const { data: insertResponseData, error: insertError } = await client
            .from('user_settings')
            .insert(insertData)
            .select()

          if (insertResponseData) {
            console.log('[DEBUG] Insert response data:', JSON.stringify(insertResponseData));
          }
          operationError = insertError;

          if (insertError) {
            console.error('[DEBUG] Error inserting user settings:', insertError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback with data:', JSON.stringify(insertData));
            const { data: upsertResponseData, error: upsertError } = await client
              .from('user_settings')
              .upsert(insertData)
              .select()

            if (upsertResponseData) {
              console.log('[DEBUG] Upsert response data:', JSON.stringify(upsertResponseData));
            }

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        } else {
          console.log('[DEBUG] Existing settings found, updating record');
          // Update the existing record
          console.log('[DEBUG] Updating user settings with data:', JSON.stringify(settingsData));

          // Try a direct SQL query approach
          try {
            // Use a raw SQL query to update the settings
            const { data: rawUpdateData, error: rawUpdateError } = await client
              .rpc('update_settings_direct', {
                p_table: 'user_settings',
                p_id: user.id,
                p_field: 'ocr_settings',
                p_value: settingsData.ocr_settings
              });

            if (rawUpdateError) {
              console.error('[DEBUG] Raw update error:', rawUpdateError);
              // Fall back to the regular update
              const { data: updateData, error: updateError } = await client
                .from('user_settings')
                .update(settingsData)
                .eq('id', user.id)
                .select();

              if (updateData) {
                console.log('[DEBUG] Update response data:', JSON.stringify(updateData));
                if (updateData.length === 0) {
                  console.warn('[DEBUG] Update returned empty array, may not have updated the database');
                }
              }
              operationError = updateError;
            } else {
              console.log('[DEBUG] Raw update successful:', rawUpdateData);
              operationError = null;
              success = true;
              return updatedSettings;
            }
          } catch (rawError) {
            console.error('[DEBUG] Raw update failed with exception:', rawError);
            // Fall back to the regular update
            const { data: updateData, error: updateError } = await client
                .from('user_settings')
                .update(settingsData)
                .eq('id', user.id)
                .select();

            if (updateData) {
              console.log('[DEBUG] Update response data:', JSON.stringify(updateData));
              if (updateData.length === 0) {
                console.warn('[DEBUG] Update returned empty array, may not have updated the database');
              }
            }
            operationError = updateError;
          }

          if (operationError) {
            console.error('[DEBUG] Error updating user settings:', operationError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const upsertPayload = {
              ...settingsData,
              id: user.id,
              created_at: new Date().toISOString() // Include this for new records
            };

            console.log('[DEBUG] Trying upsert with data:', JSON.stringify(upsertPayload));
            const { data: upsertResponseData, error: upsertError } = await client
              .from('user_settings')
              .upsert(upsertPayload)
              .select()

            if (upsertResponseData) {
              console.log('[DEBUG] Upsert response data:', JSON.stringify(upsertResponseData));
            }

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        }
      } catch (dbError) {
        console.error('[DEBUG] Database operation failed:', dbError);
        operationError = dbError;
      }

      // Always update the local cache, regardless of database errors
      this.cache.ocr = updatedSettings;
      this.lastUpdate = Date.now();

      if (operationError) {
        console.error('[DEBUG] Error saving user OCR settings to database:', operationError);
        // Continue anyway - we've already updated the local cache
      } else {
        console.log('[DEBUG] Successfully saved OCR settings to database');
      }

      // Clear the cache to ensure we get fresh data next time
      if (success) {
        // Return the updated settings
        return updatedSettings;
      } else {
        // Return null to indicate failure
        return null;
      }
    } catch (error) {
      console.error('[DEBUG] Exception updating user OCR settings:', error);
      return null;
    }
  }

  /**
   * Get the current user's processing settings
   */
  async getProcessingSettings(): Promise<ProcessingSettings> {
    const now = Date.now()
    if (this.cache.processing && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.processing
    }

    if (!isSupabaseConfigured()) {
      return DEFAULT_PROCESSING_SETTINGS
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('No authenticated user found, using default processing settings');
      return DEFAULT_PROCESSING_SETTINGS;
    }

    try {
      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      let data, error;

      if (serviceClient) {
        console.log('[DEBUG] Using service client to fetch processing settings');
        // Use service client to bypass RLS policies
        ({ data, error } = await serviceClient
          .from('user_settings')
          .select('processing_settings')
          .eq('id', user.id)
          .maybeSingle());
      } else {
        // Fall back to authenticated client
        const authenticatedSupabase = getSupabaseClient();
        ({ data, error } = await authenticatedSupabase
          .from('user_settings')
          .select('processing_settings')
          .eq('id', user.id)
          .maybeSingle());
      }

      if (error) {
        console.error('Error fetching processing settings:', error);
        return DEFAULT_PROCESSING_SETTINGS;
      }

      if (!data) {
        console.log('User processing settings not found, using defaults');
        
        // Try to create default settings if they don't exist
        this.createDefaultSettings().catch(err => {
          console.error('[DEBUG] Error creating default settings:', err);
        });
        
        return DEFAULT_PROCESSING_SETTINGS;
      }

      // Update cache
      this.cache.processing = data.processing_settings as ProcessingSettings;
      this.lastUpdate = now;
      return data.processing_settings as ProcessingSettings;
    } catch (error) {
      console.error('Error getting user processing settings:', error)
      return DEFAULT_PROCESSING_SETTINGS
    }
  }

  /**
   * Update the current user's processing settings
   * @returns The updated settings if successful, or null if there was an error
   */
  async updateProcessingSettings(settings: Partial<ProcessingSettings>): Promise<ProcessingSettings | null> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping processing settings update');
      return null;
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping processing settings update');
      return null;
    }

    try {
      console.log('[DEBUG] Updating processing settings for user:', user.id);

      // Get current settings
      const currentSettings = await this.getProcessingSettings()

      // Update settings
      const updatedSettings = {
        ...currentSettings,
        ...settings
      }

      console.log('[DEBUG] Updated processing settings:', updatedSettings);

      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      
      // Get the authenticated Supabase client as fallback
      const authenticatedSupabase = getSupabaseClient();
      
      // Determine which client to use
      const client = serviceClient || authenticatedSupabase;
      
      if (serviceClient) {
        console.log('[DEBUG] Using service client for processing settings update (bypasses RLS)');
      } else {
        console.log('[DEBUG] Using authenticated client for processing settings update');
      }

      // Variable to track errors across try/catch blocks
      let operationError = null;
      let success = false;

      try {
        // First check if the user has a settings record
        const { data: existingSettings, error: checkError } = await client
          .from('user_settings')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (checkError) {
          console.error('[DEBUG] Error checking for existing user settings:', checkError);
          // Continue anyway - we'll try to insert/update
        }

        // Prepare the data for insert or update
        const settingsData = {
          processing_settings: updatedSettings,
          updated_at: new Date().toISOString()
        };

        if (!existingSettings) {
          console.log('[DEBUG] No existing settings found, creating new record');
          // Add additional fields for new records
          const insertData = {
            ...settingsData,
            id: user.id,
            created_at: new Date().toISOString()
          };

          // Create a new record if one doesn't exist
          const { error: insertError } = await client
            .from('user_settings')
            .insert(insertData)

          operationError = insertError;

          if (insertError) {
            console.error('[DEBUG] Error inserting user settings:', insertError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const { error: upsertError } = await client
              .from('user_settings')
              .upsert(insertData)

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        } else {
          console.log('[DEBUG] Existing settings found, updating record');
          // Update the existing record
          const { error: updateError } = await client
            .from('user_settings')
            .update(settingsData)
            .eq('id', user.id)

          operationError = updateError;

          if (updateError) {
            console.error('[DEBUG] Error updating user settings:', updateError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const upsertData = {
              ...settingsData,
              id: user.id,
              created_at: new Date().toISOString() // Include this for new records
            };

            const { error: upsertError } = await client
              .from('user_settings')
              .upsert(upsertData)

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        }
      } catch (dbError) {
        console.error('[DEBUG] Database operation failed:', dbError);
        operationError = dbError;
      }

      // Always update the local cache, regardless of database errors
      this.cache.processing = updatedSettings;
      this.lastUpdate = Date.now();

      if (operationError) {
        console.error('[DEBUG] Error saving user processing settings to database:', operationError);
        // Continue anyway - we've already updated the local cache
      } else {
        console.log('[DEBUG] Successfully saved processing settings to database');
      }

      // Return the updated settings or null based on success
      if (success) {
        return updatedSettings;
      } else {
        return null;
      }

    } catch (error) {
      console.error('[DEBUG] Exception updating user processing settings:', error);
      // Don't update the cache if we don't have the updated settings
      return null;
    }
  }

  /**
   * Get the current user's upload settings
   */
  async getUploadSettings(): Promise<UploadSettings> {
    const now = Date.now()
    if (this.cache.upload && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.upload
    }

    if (!isSupabaseConfigured()) {
      return DEFAULT_UPLOAD_SETTINGS
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('No authenticated user found, using default upload settings');
      return DEFAULT_UPLOAD_SETTINGS;
    }

    try {
      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      let data, error;

      if (serviceClient) {
        console.log('[DEBUG] Using service client to fetch upload settings');
        // Use service client to bypass RLS policies
        ({ data, error } = await serviceClient
          .from('user_settings')
          .select('upload_settings')
          .eq('id', user.id)
          .maybeSingle());
      } else {
        // Fall back to authenticated client
        const authenticatedSupabase = getSupabaseClient();
        ({ data, error } = await authenticatedSupabase
          .from('user_settings')
          .select('upload_settings')
          .eq('id', user.id)
          .maybeSingle());
      }

      if (error) {
        console.error('Error fetching upload settings:', error);
        return DEFAULT_UPLOAD_SETTINGS;
      }

      if (!data) {
        console.log('User upload settings not found, using defaults');
        
        // Try to create default settings if they don't exist
        this.createDefaultSettings().catch(err => {
          console.error('[DEBUG] Error creating default settings:', err);
        });
        
        return DEFAULT_UPLOAD_SETTINGS;
      }

      // Update cache
      this.cache.upload = data.upload_settings as UploadSettings;
      this.lastUpdate = now;
      return data.upload_settings as UploadSettings;
    } catch (error) {
      console.error('Error getting user upload settings:', error)
      return DEFAULT_UPLOAD_SETTINGS
    }
  }

  /**
   * Update the current user's upload settings
   * @returns The updated settings if successful, or null if there was an error
   */
  async updateUploadSettings(settings: Partial<UploadSettings>): Promise<UploadSettings | null> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping upload settings update');
      return null;
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping upload settings update');
      return null;
    }

    try {
      console.log('[DEBUG] Updating upload settings for user:', user.id);

      // Get current settings
      const currentSettings = await this.getUploadSettings()

      // Update settings
      const updatedSettings = {
        ...currentSettings,
        ...settings
      }

      console.log('[DEBUG] Updated upload settings:', updatedSettings);

      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      
      // Get the authenticated Supabase client as fallback
      const authenticatedSupabase = getSupabaseClient();
      
      // Determine which client to use
      const client = serviceClient || authenticatedSupabase;
      
      if (serviceClient) {
        console.log('[DEBUG] Using service client for upload settings update (bypasses RLS)');
      } else {
        console.log('[DEBUG] Using authenticated client for upload settings update');
      }

      // Variable to track errors across try/catch blocks
      let operationError = null;
      let success = false;

      try {
        // First check if the user has a settings record
        const { data: existingSettings, error: checkError } = await client
          .from('user_settings')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (checkError) {
          console.error('[DEBUG] Error checking for existing user settings:', checkError);
          // Continue anyway - we'll try to insert/update
        }

        // Prepare the data for insert or update
        const settingsData = {
          upload_settings: updatedSettings,
          updated_at: new Date().toISOString()
        };

        if (!existingSettings) {
          console.log('[DEBUG] No existing settings found, creating new record');
          // Add additional fields for new records
          const insertData = {
            ...settingsData,
            id: user.id,
            created_at: new Date().toISOString()
          };

          // Create a new record if one doesn't exist
          const { error: insertError } = await client
            .from('user_settings')
            .insert(insertData)

          operationError = insertError;

          if (insertError) {
            console.error('[DEBUG] Error inserting user settings:', insertError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const { error: upsertError } = await client
              .from('user_settings')
              .upsert(insertData)

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        } else {
          console.log('[DEBUG] Existing settings found, updating record');
          // Update the existing record
          const { error: updateError } = await client
            .from('user_settings')
            .update(settingsData)
            .eq('id', user.id)

          operationError = updateError;

          if (updateError) {
            console.error('[DEBUG] Error updating user settings:', updateError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const upsertData = {
              ...settingsData,
              id: user.id,
              created_at: new Date().toISOString() // Include this for new records
            };

            const { error: upsertError } = await client
              .from('user_settings')
              .upsert(upsertData)

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        }
      } catch (dbError) {
        console.error('[DEBUG] Database operation failed:', dbError);
        operationError = dbError;
      }

      // Always update the local cache, regardless of database errors
      this.cache.upload = updatedSettings;
      this.lastUpdate = Date.now();

      if (operationError) {
        console.error('[DEBUG] Error saving user upload settings to database:', operationError);
        // Continue anyway - we've already updated the local cache
      } else {
        console.log('[DEBUG] Successfully saved upload settings to database');
      }

      // Return the updated settings or null based on success
      if (success) {
        return updatedSettings;
      } else {
        return null;
      }
    } catch (error) {
      console.error('[DEBUG] Exception updating user upload settings:', error);
      // Don't update the cache if we don't have the updated settings
      return null;
    }
  }

  /**
   * Get the current user's display settings
   */
  async getDisplaySettings(): Promise<DisplaySettings> {
    const now = Date.now()
    if (this.cache.display && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.display
    }

    if (!isSupabaseConfigured()) {
      return DEFAULT_DISPLAY_SETTINGS
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('No authenticated user found, using default display settings');
      return DEFAULT_DISPLAY_SETTINGS;
    }

    try {
      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      let data, error;

      if (serviceClient) {
        console.log('[DEBUG] Using service client to fetch display settings');
        // Use service client to bypass RLS policies
        ({ data, error } = await serviceClient
          .from('user_settings')
          .select('display_settings')
          .eq('id', user.id)
          .maybeSingle());
      } else {
        // Fall back to authenticated client
        const authenticatedSupabase = getSupabaseClient();
        ({ data, error } = await authenticatedSupabase
          .from('user_settings')
          .select('display_settings')
          .eq('id', user.id)
          .maybeSingle());
      }

      if (error) {
        console.error('Error fetching display settings:', error);
        return DEFAULT_DISPLAY_SETTINGS;
      }

      if (!data) {
        console.log('User display settings not found, using defaults');
        
        // Try to create default settings if they don't exist
        this.createDefaultSettings().catch(err => {
          console.error('[DEBUG] Error creating default settings:', err);
        });
        
        return DEFAULT_DISPLAY_SETTINGS;
      }

      // Update cache
      this.cache.display = data.display_settings as DisplaySettings;
      this.lastUpdate = now;
      return data.display_settings as DisplaySettings;
    } catch (error) {
      console.error('Error getting user display settings:', error)
      return DEFAULT_DISPLAY_SETTINGS
    }
  }

  /**
   * Update the current user's display settings
   * @returns The updated settings if successful, or null if there was an error
   */
  async updateDisplaySettings(settings: Partial<DisplaySettings>): Promise<DisplaySettings | null> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping display settings update');
      return null;
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping display settings update');
      return null;
    }

    try {
      console.log('[DEBUG] Updating display settings for user:', user.id);

      // Get current settings
      const currentSettings = await this.getDisplaySettings()

      // Update settings
      const updatedSettings = {
        ...currentSettings,
        ...settings
      }

      console.log('[DEBUG] Updated display settings:', updatedSettings);

      // Try to get the service client first (server-side only)
      const serviceClient = getServiceClient();
      
      // Get the authenticated Supabase client as fallback
      const authenticatedSupabase = getSupabaseClient();
      
      // Determine which client to use
      const client = serviceClient || authenticatedSupabase;
      
      if (serviceClient) {
        console.log('[DEBUG] Using service client for display settings update (bypasses RLS)');
      } else {
        console.log('[DEBUG] Using authenticated client for display settings update');
      }

      // Variable to track errors across try/catch blocks
      let operationError = null;
      let success = false;

      try {
        // First check if the user has a settings record
        const { data: existingSettings, error: checkError } = await client
          .from('user_settings')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (checkError) {
          console.error('[DEBUG] Error checking for existing user settings:', checkError);
          // Continue anyway - we'll try to insert/update
        }

        // Prepare the data for insert or update
        const settingsData = {
          display_settings: updatedSettings,
          updated_at: new Date().toISOString()
        };

        if (!existingSettings) {
          console.log('[DEBUG] No existing settings found, creating new record');
          // Add additional fields for new records
          const insertData = {
            ...settingsData,
            id: user.id,
            created_at: new Date().toISOString()
          };

          // Create a new record if one doesn't exist
          const { error: insertError } = await client
            .from('user_settings')
            .insert(insertData)

          operationError = insertError;

          if (insertError) {
            console.error('[DEBUG] Error inserting user settings:', insertError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const { error: upsertError } = await client
              .from('user_settings')
              .upsert(insertData)

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        } else {
          console.log('[DEBUG] Existing settings found, updating record');
          // Update the existing record
          const { error: updateError } = await client
            .from('user_settings')
            .update(settingsData)
            .eq('id', user.id)

          operationError = updateError;

          if (updateError) {
            console.error('[DEBUG] Error updating user settings:', updateError);
            // Try upsert as a fallback
            console.log('[DEBUG] Trying upsert as a fallback');
            const upsertData = {
              ...settingsData,
              id: user.id,
              created_at: new Date().toISOString() // Include this for new records
            };

            const { error: upsertError } = await client
              .from('user_settings')
              .upsert(upsertData)

            if (upsertError) {
              console.error('[DEBUG] Upsert fallback also failed:', upsertError);
              operationError = upsertError;
            } else {
              console.log('[DEBUG] Upsert fallback succeeded');
              operationError = null;
              success = true;
            }
          } else {
            success = true;
          }
        }
      } catch (dbError) {
        console.error('[DEBUG] Database operation failed:', dbError);
        operationError = dbError;
      }

      // Always update the local cache, regardless of database errors
      this.cache.display = updatedSettings;
      this.lastUpdate = Date.now();

      if (operationError) {
        console.error('[DEBUG] Error saving user display settings to database:', operationError);
        // Continue anyway - we've already updated the local cache
      } else {
        console.log('[DEBUG] Successfully saved display settings to database');
      }

      // Return the updated settings or null based on success
      if (success) {
        return updatedSettings;
      } else {
        return null;
      }
    } catch (error) {
      console.error('[DEBUG] Exception updating user display settings:', error);
      // Don't update the cache if we don't have the updated settings
      return null;
    }
  }

  /**
   * Create default settings for a user if they don't exist
   */
  async createDefaultSettings(): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping default settings creation');
      return false;
    }

    // Get the current user
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping default settings creation');
      return false;
    }

    try {
      console.log('[DEBUG] Creating default settings for user:', user.id);

      // Try to use the service client first (server-side only)
      const serviceClient = getServiceClient();
      const authenticatedSupabase = getSupabaseClient();
      
      // Determine which client to use
      const client = serviceClient || authenticatedSupabase;
      
      if (serviceClient) {
        console.log('[DEBUG] Using service client for default settings creation (bypasses RLS)');
      } else {
        console.log('[DEBUG] Using authenticated client for default settings creation');
      }

      // First check if the user already has settings
      const { data: existingSettings, error: checkError } = await client
        .from('user_settings')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error('[DEBUG] Error checking for existing user settings:', checkError);
        return false;
      }

      // If settings already exist, don't create defaults
      if (existingSettings) {
        console.log('[DEBUG] User already has settings, skipping default creation');
        return true;
      }

      // Create default settings
      const defaultSettings = {
        id: user.id,
        ocr_settings: DEFAULT_OCR_SETTINGS,
        processing_settings: DEFAULT_PROCESSING_SETTINGS,
        upload_settings: DEFAULT_UPLOAD_SETTINGS,
        display_settings: DEFAULT_DISPLAY_SETTINGS,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('[DEBUG] Inserting default settings:', JSON.stringify(defaultSettings));

      // Insert default settings
      const { data: insertResponseData, error: insertError } = await client
        .from('user_settings')
        .insert(defaultSettings)
        .select();

      if (insertError) {
        console.error('[DEBUG] Error creating default settings:', insertError);

        // Try upsert as a fallback
        console.log('[DEBUG] Trying upsert as a fallback for default settings');
        const { data: upsertResponseData, error: upsertError } = await client
          .from('user_settings')
          .upsert(defaultSettings)
          .select();

        if (upsertError) {
          console.error('[DEBUG] Upsert fallback also failed for default settings:', upsertError);
          return false;
        } else {
          console.log('[DEBUG] Successfully created default settings using upsert:', JSON.stringify(upsertResponseData));
          return true;
        }
      }

      console.log('[DEBUG] Successfully created default settings:', JSON.stringify(insertResponseData));
      return true;
    } catch (error) {
      console.error('[DEBUG] Exception creating default settings:', error);
      return false;
    }
  }

  /**
   * Clear the settings cache
   */
  clearCache(): void {
    this.cache = {
      ocr: null,
      processing: null,
      upload: null,
      display: null
    }
    this.lastUpdate = 0
  }
}

// Create a singleton instance of the user settings service
const userSettingsServiceInstance = new UserSettingsService()

// Export the singleton instance
export const userSettingsService = userSettingsServiceInstance
