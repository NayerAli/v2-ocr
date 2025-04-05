import { supabase, isSupabaseConfigured } from './supabase-client'
import type { ProcessingSettings } from '@/types/settings'

// Default processing settings
const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
}

/**
 * Service for managing application settings in Supabase
 */
class SettingsService {
  private cache: {
    processing: ProcessingSettings | null
  } = {
    processing: null
  }

  private lastUpdate = 0
  private readonly CACHE_TTL = 60000 // 1 minute cache

  constructor() {
    // Constructor
  }

  /**
   * Initialize the settings service
   * This will create default settings if they don't exist
   */
  async initialize() {
    if (!isSupabaseConfigured()) {
      return
    }

    try {

      // Check if processing settings exist
      const { data: processingSettings, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'processing')
        .single()

      // If not, create default processing settings
      if (error || !processingSettings) {
        console.log('Processing settings not found, creating defaults...')

        // Get the next available ID
        const { data: maxIdData } = await supabase
          .from('settings')
          .select('id')
          .order('id', { ascending: false })
          .limit(1)
          .single()

        const nextId = maxIdData ? (maxIdData.id + 1) : 1
        console.log('Using ID for new settings:', nextId)

        // Insert with settings in both value and data fields for compatibility
        // But ensure value is the primary source of truth
        const { error: insertError } = await supabase
          .from('settings')
          .insert({
            id: nextId,
            key: 'processing',
            value: DEFAULT_PROCESSING_SETTINGS,  // Primary source of truth
            data: DEFAULT_PROCESSING_SETTINGS,   // Keep for backward compatibility
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (insertError) {
          console.error('Error inserting default settings:', insertError)
        } else {
          console.log('Default settings inserted successfully')
        }
      } else {
        console.log('Processing settings found:', processingSettings)
      }
    } catch (error) {
      console.error('Error initializing settings:', error)
    }
  }

  /**
   * Get processing settings from Supabase
   */
  async getProcessingSettings(): Promise<ProcessingSettings> {
    // Always clear the cache to ensure we get fresh settings
    this.cache.processing = null

    const now = Date.now()

    if (!isSupabaseConfigured()) {
      return DEFAULT_PROCESSING_SETTINGS
    }

    // Initialize settings if needed
    await this.initialize()

    try {
      // First, check if the settings table exists and has the correct schema
      try {
        const { data: tableCheck, error: tableError } = await supabase
          .from('settings')
          .select('id')
          .limit(1)

        if (tableError) {
          // Table might not exist, try to create it
          await this.createSettingsTable()
          return DEFAULT_PROCESSING_SETTINGS
        }
      } catch (tableCheckError) {
        return DEFAULT_PROCESSING_SETTINGS
      }

      // Now try to get the processing settings
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value, data')
          .eq('key', 'processing')
          .single()

        if (error) {
          if (error.code === '42703') { // Column doesn't exist
            // Try to fix the table schema
            await this.fixSettingsTableSchema()
            return DEFAULT_PROCESSING_SETTINGS
          } else {
            return DEFAULT_PROCESSING_SETTINGS
          }
        }

        // Check if we have data in the value column (prioritize value column)
        if (data && data.value && Object.keys(data.value).length > 0) {
          // Use value column if it exists and has content
          this.cache.processing = data.value as ProcessingSettings
          this.lastUpdate = now
          return data.value as ProcessingSettings
        }
        // Check if we have data in the data column as fallback
        else if (data && data.data && Object.keys(data.data).length > 0) {
          // Use data column if it exists and has content
          this.cache.processing = data.data as ProcessingSettings
          this.lastUpdate = now
          return data.data as ProcessingSettings
        } else {
          // If no settings found, create default settings

          // Get the next available ID
          const { data: maxIdData } = await supabase
            .from('settings')
            .select('id')
            .order('id', { ascending: false })
            .limit(1)
            .single()

          const nextId = maxIdData ? (maxIdData.id + 1) : 1

          // Insert default settings directly
          // But ensure value is the primary source of truth
          const { error: insertError } = await supabase
            .from('settings')
            .insert({
              id: nextId,
              key: 'processing',
              value: DEFAULT_PROCESSING_SETTINGS,  // Primary source of truth
              data: DEFAULT_PROCESSING_SETTINGS,   // Keep for backward compatibility
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })

          if (insertError) {
            console.error('Error inserting default settings:', insertError)
          } else {
            console.log('Default settings inserted successfully')
          }

          // Return default settings
          this.cache.processing = DEFAULT_PROCESSING_SETTINGS
          this.lastUpdate = now
          return DEFAULT_PROCESSING_SETTINGS
        }
      } catch (fetchError) {
        console.error('Error fetching processing settings:', fetchError)
        return DEFAULT_PROCESSING_SETTINGS
      }
    } catch (error) {
      console.error('Error in getProcessingSettings:', error)
      return DEFAULT_PROCESSING_SETTINGS
    }
  }

  /**
   * Create the settings table if it doesn't exist
   */
  private async createSettingsTable(): Promise<void> {
    try {
      console.log('Attempting to create settings table...')

      // Try to create the table using SQL
      const { data, error } = await supabase.sql`
        CREATE TABLE IF NOT EXISTS public.settings (
          id INTEGER PRIMARY KEY,
          key TEXT NOT NULL,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        -- Create index on key column for faster lookups
        CREATE INDEX IF NOT EXISTS settings_key_idx ON public.settings (key);

        -- Set up Row Level Security (RLS) policies
        ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

        -- Create policies
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = 'settings'
            AND policyname = 'Allow all operations for authenticated users'
          ) THEN
            CREATE POLICY "Allow all operations for authenticated users" ON public.settings
              FOR ALL USING (auth.role() = 'authenticated');
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = 'settings'
            AND policyname = 'Allow read for anonymous users'
          ) THEN
            CREATE POLICY "Allow read for anonymous users" ON public.settings
              FOR SELECT USING (auth.role() = 'anon');
          END IF;
        END
        $$;
      `

      if (error) {
        console.error('Error creating settings table:', error)
      } else {
        console.log('Settings table created successfully:', data)

        // Insert default processing settings
        console.log('Inserting default processing settings...')

        // Get the next available ID
        const { data: maxIdData } = await supabase
          .from('settings')
          .select('id')
          .order('id', { ascending: false })
          .limit(1)
          .single()

        const nextId = maxIdData ? (maxIdData.id + 1) : 1
        console.log('Using ID for new settings:', nextId)

        // Insert default settings
        // But ensure value is the primary source of truth
        const { error: insertError } = await supabase
          .from('settings')
          .insert({
            id: nextId,
            key: 'processing',
            value: DEFAULT_PROCESSING_SETTINGS,  // Primary source of truth
            data: DEFAULT_PROCESSING_SETTINGS,   // Keep for backward compatibility
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (insertError) {
          console.error('Error inserting default settings:', insertError)
        } else {
          console.log('Default settings inserted successfully')
        }
      }
    } catch (error) {
      console.error('Error creating settings table:', error)
    }
  }

  /**
   * Fix the settings table schema if the data column is missing
   */
  private async fixSettingsTableSchema(): Promise<void> {
    try {
      console.log('Attempting to fix settings table schema...')

      // Try to add the data column
      const { data, error } = await supabase.sql`
        -- Add data column if it doesn't exist
        ALTER TABLE public.settings
        ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

        -- Create index on key column for faster lookups
        CREATE INDEX IF NOT EXISTS settings_key_idx ON public.settings (key);
      `

      if (error) {
        console.error('Error fixing settings table schema:', error)
      } else {
        console.log('Settings table schema fixed successfully:', data)

        // Insert default processing settings
        console.log('Inserting default processing settings after schema fix...')

        // Get the next available ID
        const { data: maxIdData } = await supabase
          .from('settings')
          .select('id')
          .order('id', { ascending: false })
          .limit(1)
          .single()

        const nextId = maxIdData ? (maxIdData.id + 1) : 1
        console.log('Using ID for new settings:', nextId)

        // Insert default settings
        // But ensure value is the primary source of truth
        const { error: insertError } = await supabase
          .from('settings')
          .insert({
            id: nextId,
            key: 'processing',
            value: DEFAULT_PROCESSING_SETTINGS,  // Primary source of truth
            data: DEFAULT_PROCESSING_SETTINGS,   // Keep for backward compatibility
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (insertError) {
          console.error('Error inserting default settings after schema fix:', insertError)
        } else {
          console.log('Default settings inserted successfully after schema fix')
        }
      }
    } catch (error) {
      console.error('Error fixing settings table schema:', error)
    }
  }

  /**
   * Update processing settings in Supabase
   * This should only be called by admin users or server-side code
   */
  async updateProcessingSettings(settings: Partial<ProcessingSettings>): Promise<void> {
    if (!isSupabaseConfigured()) {
      return
    }

    try {
      // Initialize settings if needed
      await this.initialize()

      // Get current settings
      const currentSettings = await this.getProcessingSettings()

      // Update settings
      const updatedSettings = {
        ...currentSettings,
        ...settings
      }

      // Save to Supabase - update both value and data fields for compatibility
      // But ensure value is the primary source of truth
      const { error } = await supabase
        .from('settings')
        .update({
          value: updatedSettings,  // Primary source of truth
          data: updatedSettings,   // Keep for backward compatibility
          updated_at: new Date().toISOString()
        })
        .eq('key', 'processing')

      if (error) {
        return
      }

      // Update cache
      this.cache.processing = updatedSettings
      this.lastUpdate = Date.now()
    } catch (error) {
      // Silently handle errors
    }
  }
}

// Create a singleton instance of the settings service
const settingsServiceInstance = new SettingsService()

// Don't initialize the settings service immediately
// It will be initialized when needed

// Export the singleton instance
export const settingsService = settingsServiceInstance
