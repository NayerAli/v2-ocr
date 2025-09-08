// System settings service for global system settings

import { getSupabaseClient } from './supabase/singleton-client'
import { getServiceClient } from './supabase/service-client'

interface CachedData<T> {
  data: T
  timestamp: number
}

interface ProcessingSettings {
  maxConcurrentJobs: number
  pagesPerChunk: number
  concurrentChunks: number
  retryAttempts: number
  retryDelay: number
}

interface OCRDefaults {
  provider: string
  language: string
  apiKey: string
  region?: string
}

interface UploadLimits {
  maxFileSize: number
  allowedFileTypes: string[]
  maxSimultaneousUploads: number
}

class SystemSettingsService {
  private supabase: ReturnType<typeof getSupabaseClient>
  private cache: Map<string, CachedData<ProcessingSettings | OCRDefaults | UploadLimits>>
  private cacheTTL: number

  constructor() {
    // Prefer the service role client when available to bypass RLS for server-side operations
    this.supabase = getServiceClient() || getSupabaseClient()
    this.cache = new Map()
    this.cacheTTL = 5 * 60 * 1000 // 5 minutes
  }

  /**
   * Get processing settings from the system_settings table
   */
  async getProcessingSettings(): Promise<ProcessingSettings> {
    // Check cache first
    const cacheKey = 'processing_settings'
    const cachedSettings = this.cache.get(cacheKey)

    if (cachedSettings && cachedSettings.timestamp > Date.now() - this.cacheTTL) {
      return cachedSettings.data as ProcessingSettings
    }

    // Default settings
    const defaultSettings: ProcessingSettings = {
      maxConcurrentJobs: 3,
      pagesPerChunk: 5,
      concurrentChunks: 3,
      retryAttempts: 2,
      retryDelay: 1000
    }

    if (!this.supabase) {
      return defaultSettings
    }

    try {
      // Fetch from database
      const { data, error } = await this.supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'processing')
        .single()

      if (error) {
        console.error('Error fetching processing settings:', error)
        return defaultSettings
      }

      const settings = data?.value || defaultSettings

      // Update cache
      this.cache.set(cacheKey, {
        data: settings,
        timestamp: Date.now()
      })

      return settings
    } catch (error) {
      console.error('Exception fetching processing settings:', error)
      return defaultSettings
    }
  }

  /**
   * Update processing settings in the system_settings table
   */
  async updateProcessingSettings(settings: Partial<ProcessingSettings>): Promise<ProcessingSettings> {
    // Validate settings
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings object')
    }

    if (!this.supabase) {
      return settings as ProcessingSettings
    }

    try {
      // Get current settings to merge with updates
      const currentSettings = await this.getProcessingSettings()
      const updatedSettings = { ...currentSettings, ...settings }

      // Update in database
      const { data, error } = await this.supabase
        .from('system_settings')
        .update({
          value: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'processing')
        .select()
        .single()

      if (error) {
        console.error('Error updating processing settings:', error)
        throw error
      }

      // Clear cache
      this.cache.delete('processing_settings')

      return data?.value || updatedSettings
    } catch (error) {
      console.error('Exception updating processing settings:', error)
      throw error
    }
  }

  /**
   * Get OCR default settings from the system_settings table
   */
  async getOCRDefaults(): Promise<OCRDefaults> {
    // Check cache first
    const cacheKey = 'ocr_defaults'
    const cachedSettings = this.cache.get(cacheKey)

    if (cachedSettings && cachedSettings.timestamp > Date.now() - this.cacheTTL) {
      return cachedSettings.data as OCRDefaults
    }

    // Default settings
    const defaultSettings: OCRDefaults = {
      provider: 'google',
      language: 'en',
      apiKey: '',
      region: ''
    }

    if (!this.supabase) {
      return defaultSettings
    }

    try {
      // Fetch from database
      const { data, error } = await this.supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'ocr_defaults')
        .single()

      if (error) {
        console.error('Error fetching OCR defaults:', error)
        return defaultSettings
      }

      const settings = data?.value || defaultSettings

      // Update cache
      this.cache.set(cacheKey, {
        data: settings,
        timestamp: Date.now()
      })

      return settings
    } catch (error) {
      console.error('Exception fetching OCR defaults:', error)
      return defaultSettings
    }
  }

  /**
   * Update OCR default settings in the system_settings table
   */
  async updateOCRDefaults(settings: Partial<OCRDefaults>): Promise<OCRDefaults> {
    // Validate settings
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings object')
    }

    if (!this.supabase) {
      return settings as OCRDefaults
    }

    try {
      // Get current settings to merge with updates
      const currentSettings = await this.getOCRDefaults()
      const updatedSettings = { ...currentSettings, ...settings }

      // Update in database
      const { data, error } = await this.supabase
        .from('system_settings')
        .update({
          value: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'ocr_defaults')
        .select()
        .single()

      if (error) {
        console.error('Error updating OCR defaults:', error)
        throw error
      }

      // Clear cache
      this.cache.delete('ocr_defaults')

      return data?.value || updatedSettings
    } catch (error) {
      console.error('Exception updating OCR defaults:', error)
      throw error
    }
  }

  /**
   * Get upload limit settings from the system_settings table
   */
  async getUploadLimits(): Promise<UploadLimits> {
    // Check cache first
    const cacheKey = 'upload_limits'
    const cachedSettings = this.cache.get(cacheKey)

    if (cachedSettings && cachedSettings.timestamp > Date.now() - this.cacheTTL) {
      return cachedSettings.data as UploadLimits
    }

    // Default settings
    const defaultSettings: UploadLimits = {
      maxFileSize: 500,
      allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
      maxSimultaneousUploads: 5
    }

    if (!this.supabase) {
      return defaultSettings
    }

    try {
      // Fetch from database
      const { data, error } = await this.supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'upload_limits')
        .single()

      if (error) {
        console.error('Error fetching upload limits:', error)
        return defaultSettings
      }

      const settings = data?.value || defaultSettings

      // Update cache
      this.cache.set(cacheKey, {
        data: settings,
        timestamp: Date.now()
      })

      return settings
    } catch (error) {
      console.error('Exception fetching upload limits:', error)
      return defaultSettings
    }
  }

  /**
   * Update upload limit settings in the system_settings table
   */
  async updateUploadLimits(settings: Partial<UploadLimits>): Promise<UploadLimits> {
    // Validate settings
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings object')
    }

    if (!this.supabase) {
      return settings as UploadLimits
    }

    try {
      // Get current settings to merge with updates
      const currentSettings = await this.getUploadLimits()
      const updatedSettings = { ...currentSettings, ...settings }

      // Update in database
      const { data, error } = await this.supabase
        .from('system_settings')
        .update({
          value: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'upload_limits')
        .select()
        .single()

      if (error) {
        console.error('Error updating upload limits:', error)
        throw error
      }

      // Clear cache
      this.cache.delete('upload_limits')

      return data?.value || updatedSettings
    } catch (error) {
      console.error('Exception updating upload limits:', error)
      throw error
    }
  }
}

export const systemSettingsService = new SystemSettingsService()
