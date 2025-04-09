import { getUser } from './auth'
import { supabase, isSupabaseConfigured } from './supabase-client'
import type { OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings } from '@/types/settings'
import { CONFIG } from '@/config/constants'

// Default settings
const DEFAULT_OCR_SETTINGS: OCRSettings = {
  provider: "google" as const,
  apiKey: process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || "",
  region: "",
  language: CONFIG.DEFAULT_LANGUAGE,
  useSystemKey: true, // Flag to indicate using the system API key
}

const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 1,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
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

  constructor() {
    // Constructor
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
    const user = await getUser()
    if (!user) {
      return DEFAULT_OCR_SETTINGS
    }

    try {
      // Get user settings from the user_settings table
      const { data, error } = await supabase
        .from('user_settings')
        .select('ocr_settings')
        .eq('id', user.id)
        .single()

      if (error || !data) {
        console.log('User OCR settings not found, using defaults')
        return DEFAULT_OCR_SETTINGS
      }

      // Update cache
      this.cache.ocr = data.ocr_settings as OCRSettings
      this.lastUpdate = now
      return data.ocr_settings as OCRSettings
    } catch (error) {
      console.error('Error getting user OCR settings:', error)
      return DEFAULT_OCR_SETTINGS
    }
  }

  /**
   * Update the current user's OCR settings
   */
  async updateOCRSettings(settings: Partial<OCRSettings>): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping OCR settings update');
      return
    }

    // Get the current user
    const user = await getUser()
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping OCR settings update');
      return
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

      // First check if the user has a settings record
      const { data: existingSettings, error: checkError } = await supabase
        .from('user_settings')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (checkError) {
        console.error('[DEBUG] Error checking for existing user settings:', checkError);
        return;
      }

      let error;

      if (!existingSettings) {
        console.log('[DEBUG] No existing settings found, creating new record');
        // Create a new record if one doesn't exist
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            id: user.id,
            ocr_settings: updatedSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        error = insertError;
      } else {
        console.log('[DEBUG] Existing settings found, updating record');
        // Update the existing record
        const { error: updateError } = await supabase
          .from('user_settings')
          .update({
            ocr_settings: updatedSettings,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)

        error = updateError;
      }

      if (error) {
        console.error('[DEBUG] Error saving user OCR settings to database:', error);
        return;
      }

      console.log('[DEBUG] OCR settings saved successfully to database');

      // Update cache
      this.cache.ocr = updatedSettings;
      this.lastUpdate = Date.now();
    } catch (error) {
      console.error('[DEBUG] Exception updating user OCR settings:', error);
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
    const user = await getUser()
    if (!user) {
      return DEFAULT_PROCESSING_SETTINGS
    }

    try {
      // Get user settings from the user_settings table
      const { data, error } = await supabase
        .from('user_settings')
        .select('processing_settings')
        .eq('id', user.id)
        .single()

      if (error || !data) {
        console.log('User processing settings not found, using defaults')
        return DEFAULT_PROCESSING_SETTINGS
      }

      // Update cache
      this.cache.processing = data.processing_settings as ProcessingSettings
      this.lastUpdate = now
      return data.processing_settings as ProcessingSettings
    } catch (error) {
      console.error('Error getting user processing settings:', error)
      return DEFAULT_PROCESSING_SETTINGS
    }
  }

  /**
   * Update the current user's processing settings
   */
  async updateProcessingSettings(settings: Partial<ProcessingSettings>): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping processing settings update');
      return
    }

    // Get the current user
    const user = await getUser()
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping processing settings update');
      return
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

      // First check if the user has a settings record
      const { data: existingSettings, error: checkError } = await supabase
        .from('user_settings')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (checkError) {
        console.error('[DEBUG] Error checking for existing user settings:', checkError);
        return;
      }

      let error;

      if (!existingSettings) {
        console.log('[DEBUG] No existing settings found, creating new record');
        // Create a new record if one doesn't exist
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            id: user.id,
            processing_settings: updatedSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        error = insertError;
      } else {
        console.log('[DEBUG] Existing settings found, updating record');
        // Update the existing record
        const { error: updateError } = await supabase
          .from('user_settings')
          .update({
            processing_settings: updatedSettings,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)

        error = updateError;
      }

      if (error) {
        console.error('[DEBUG] Error saving user processing settings to database:', error);
        return;
      }

      console.log('[DEBUG] Processing settings saved successfully to database');

      // Update cache
      this.cache.processing = updatedSettings;
      this.lastUpdate = Date.now();
    } catch (error) {
      console.error('[DEBUG] Exception updating user processing settings:', error);
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
    const user = await getUser()
    if (!user) {
      return DEFAULT_UPLOAD_SETTINGS
    }

    try {
      // Get user settings from the user_settings table
      const { data, error } = await supabase
        .from('user_settings')
        .select('upload_settings')
        .eq('id', user.id)
        .single()

      if (error || !data) {
        console.log('User upload settings not found, using defaults')
        return DEFAULT_UPLOAD_SETTINGS
      }

      // Update cache
      this.cache.upload = data.upload_settings as UploadSettings
      this.lastUpdate = now
      return data.upload_settings as UploadSettings
    } catch (error) {
      console.error('Error getting user upload settings:', error)
      return DEFAULT_UPLOAD_SETTINGS
    }
  }

  /**
   * Update the current user's upload settings
   */
  async updateUploadSettings(settings: Partial<UploadSettings>): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping upload settings update');
      return
    }

    // Get the current user
    const user = await getUser()
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping upload settings update');
      return
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

      // First check if the user has a settings record
      const { data: existingSettings, error: checkError } = await supabase
        .from('user_settings')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (checkError) {
        console.error('[DEBUG] Error checking for existing user settings:', checkError);
        return;
      }

      let error;

      if (!existingSettings) {
        console.log('[DEBUG] No existing settings found, creating new record');
        // Create a new record if one doesn't exist
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            id: user.id,
            upload_settings: updatedSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        error = insertError;
      } else {
        console.log('[DEBUG] Existing settings found, updating record');
        // Update the existing record
        const { error: updateError } = await supabase
          .from('user_settings')
          .update({
            upload_settings: updatedSettings,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)

        error = updateError;
      }

      if (error) {
        console.error('[DEBUG] Error saving user upload settings to database:', error);
        return;
      }

      console.log('[DEBUG] Upload settings saved successfully to database');

      // Update cache
      this.cache.upload = updatedSettings;
      this.lastUpdate = Date.now();
    } catch (error) {
      console.error('[DEBUG] Exception updating user upload settings:', error);
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
    const user = await getUser()
    if (!user) {
      return DEFAULT_DISPLAY_SETTINGS
    }

    try {
      // Get user settings from the user_settings table
      const { data, error } = await supabase
        .from('user_settings')
        .select('display_settings')
        .eq('id', user.id)
        .single()

      if (error || !data) {
        console.log('User display settings not found, using defaults')
        return DEFAULT_DISPLAY_SETTINGS
      }

      // Update cache
      this.cache.display = data.display_settings as DisplaySettings
      this.lastUpdate = now
      return data.display_settings as DisplaySettings
    } catch (error) {
      console.error('Error getting user display settings:', error)
      return DEFAULT_DISPLAY_SETTINGS
    }
  }

  /**
   * Update the current user's display settings
   */
  async updateDisplaySettings(settings: Partial<DisplaySettings>): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.log('[DEBUG] Supabase not configured, skipping display settings update');
      return
    }

    // Get the current user
    const user = await getUser()
    if (!user) {
      console.log('[DEBUG] No authenticated user, skipping display settings update');
      return
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

      // First check if the user has a settings record
      const { data: existingSettings, error: checkError } = await supabase
        .from('user_settings')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (checkError) {
        console.error('[DEBUG] Error checking for existing user settings:', checkError);
        return;
      }

      let error;

      if (!existingSettings) {
        console.log('[DEBUG] No existing settings found, creating new record');
        // Create a new record if one doesn't exist
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            id: user.id,
            display_settings: updatedSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        error = insertError;
      } else {
        console.log('[DEBUG] Existing settings found, updating record');
        // Update the existing record
        const { error: updateError } = await supabase
          .from('user_settings')
          .update({
            display_settings: updatedSettings,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)

        error = updateError;
      }

      if (error) {
        console.error('[DEBUG] Error saving user display settings to database:', error);
        return;
      }

      console.log('[DEBUG] Display settings saved successfully to database');

      // Update cache
      this.cache.display = updatedSettings;
      this.lastUpdate = Date.now();
    } catch (error) {
      console.error('[DEBUG] Exception updating user display settings:', error);
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
