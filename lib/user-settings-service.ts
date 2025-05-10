import { getSupabaseClient, isSupabaseConfigured } from './database/utils'
import { getUser } from './auth'
import { authCompat } from '@/lib/auth-compat'
import type { OCRSettings, ProcessingSettings, UploadSettings, DisplaySettings } from '@/types/settings'
import { CONFIG } from '@/config/constants'

const DEFAULT_OCR_SETTINGS: OCRSettings = {
  provider: "google" as const,
  apiKey: process.env.NEXT_PUBLIC_DEFAULT_OCR_API_KEY || "",
  region: "",
  language: CONFIG.DEFAULT_LANGUAGE,
  useSystemKey: true,
}

const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 1,
  pagesPerChunk: 2,
  concurrentChunks: 1,
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

interface ServiceOptions {
  serverContext?: boolean;
  forceRefresh?: boolean;
}

class UserSettingsService {
  private cache = {
    ocr: null as OCRSettings | null,
    processing: null as ProcessingSettings | null,
    upload: null as UploadSettings | null,
    display: null as DisplaySettings | null,
  }
  private lastUpdate = 0
  private readonly CACHE_TTL = 60000
  private userId: string | null = null
  private isServerContext = false

  setUserId(userId: string) {
    this.userId = userId
  }

  setServerContext(isServerContext: boolean) {
    this.isServerContext = isServerContext
  }

  // Clear or invalidate the settings cache
  clearCache() {
    this.cache = {
      ocr: null,
      processing: null,
      upload: null,
      display: null,
    }
    this.lastUpdate = 0
  }

  private async getCurrentUser() {
    if (this.userId) return { id: this.userId }

    // Try compatible auth first (works in both client and server)
    try {
      const compatUser = await authCompat.getUser()
      if (compatUser) return compatUser
    } catch (error) {
      console.log('[DEBUG] Error getting user with compat auth, falling back to client auth:', error)
    }

    // Fall back to client-side auth
    return await getUser()
  }

  async getOCRSettings(options: ServiceOptions = {}): Promise<OCRSettings> {
    const now = Date.now()
    const useCache = !options.forceRefresh && this.cache.ocr && now - this.lastUpdate < this.CACHE_TTL
    
    // Use cached settings if available and not forcing refresh
    if (useCache) {
      if (options.serverContext) {
        // Ensure useSystemKey is set correctly in server context
        return {
          ...this.cache.ocr as OCRSettings,
          useSystemKey: true
        }
      }
      return this.cache.ocr as OCRSettings
    }
    
    if (!isSupabaseConfigured()) {
      return options.serverContext ? { ...DEFAULT_OCR_SETTINGS, useSystemKey: true } : DEFAULT_OCR_SETTINGS
    }
    
    const user = await this.getCurrentUser()
    if (!user) {
      return options.serverContext ? { ...DEFAULT_OCR_SETTINGS, useSystemKey: true } : DEFAULT_OCR_SETTINGS
    }
    
    try {
      const { data, error } = await getSupabaseClient().from('user_settings').select('ocr_settings').eq('id', user.id).single()
      
      if (error || !data) {
        return options.serverContext ? { ...DEFAULT_OCR_SETTINGS, useSystemKey: true } : DEFAULT_OCR_SETTINGS
      }
      
      let settings = data.ocr_settings as OCRSettings
      
      // Force useSystemKey to true in server context (for background processing)
      if (options.serverContext) {
        settings = {
          ...settings,
          useSystemKey: true
        }
      }
      
      // Store the settings in cache
      this.cache.ocr = settings
      this.lastUpdate = now
      
      return settings
    } catch {
      return options.serverContext ? { ...DEFAULT_OCR_SETTINGS, useSystemKey: true } : DEFAULT_OCR_SETTINGS
    }
  }

  async updateOCRSettings(settings: Partial<OCRSettings>): Promise<OCRSettings | null> {
    if (!isSupabaseConfigured()) return null
    const user = await this.getCurrentUser()
    if (!user) return null
      const currentSettings = await this.getOCRSettings()
    const updatedSettings = { ...currentSettings, ...settings }
    const { data: existingSettings } = await getSupabaseClient().from('user_settings').select('id').eq('id', user.id).maybeSingle()
    const settingsData = { ocr_settings: updatedSettings, updated_at: new Date().toISOString() }
        if (!existingSettings) {
      const insertData = { ...settingsData, id: user.id, created_at: new Date().toISOString() }
      const { error } = await getSupabaseClient().from('user_settings').insert(insertData)
      if (error) return null
      this.cache.ocr = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
            } else {
      const { error } = await getSupabaseClient().from('user_settings').update(settingsData).eq('id', user.id)
      if (error) return null
      this.cache.ocr = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
    }
  }

  async getProcessingSettings(options: ServiceOptions = {}): Promise<ProcessingSettings> {
    const now = Date.now()
    if (!options.forceRefresh && this.cache.processing && now - this.lastUpdate < this.CACHE_TTL) {
      return this.cache.processing
    }
    
    if (!isSupabaseConfigured()) return DEFAULT_PROCESSING_SETTINGS
    
    const user = await this.getCurrentUser()
    if (!user) return DEFAULT_PROCESSING_SETTINGS
    
    try {
      const { data, error } = await getSupabaseClient().from('user_settings').select('processing_settings').eq('id', user.id).single()
      if (error || !data) return DEFAULT_PROCESSING_SETTINGS
      
      this.cache.processing = data.processing_settings as ProcessingSettings
      this.lastUpdate = now
      
      return data.processing_settings as ProcessingSettings
    } catch {
      return DEFAULT_PROCESSING_SETTINGS
    }
  }

  async updateProcessingSettings(settings: Partial<ProcessingSettings>): Promise<ProcessingSettings | null> {
    if (!isSupabaseConfigured()) return null
    const user = await this.getCurrentUser()
    if (!user) return null
      const currentSettings = await this.getProcessingSettings()
    const updatedSettings = { ...currentSettings, ...settings }
    const { data: existingSettings } = await getSupabaseClient().from('user_settings').select('id').eq('id', user.id).maybeSingle()
    const settingsData = { processing_settings: updatedSettings, updated_at: new Date().toISOString() }
        if (!existingSettings) {
      const insertData = { ...settingsData, id: user.id, created_at: new Date().toISOString() }
      const { error } = await getSupabaseClient().from('user_settings').insert(insertData)
      if (error) return null
      this.cache.processing = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
            } else {
      const { error } = await getSupabaseClient().from('user_settings').update(settingsData).eq('id', user.id)
      if (error) return null
      this.cache.processing = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
    }
  }

  async getUploadSettings(): Promise<UploadSettings> {
    const now = Date.now()
    if (this.cache.upload && now - this.lastUpdate < this.CACHE_TTL) return this.cache.upload
    if (!isSupabaseConfigured()) return DEFAULT_UPLOAD_SETTINGS
    const user = await this.getCurrentUser()
    if (!user) return DEFAULT_UPLOAD_SETTINGS
    try {
      const { data, error } = await getSupabaseClient().from('user_settings').select('upload_settings').eq('id', user.id).single()
      if (error || !data) return DEFAULT_UPLOAD_SETTINGS
      this.cache.upload = data.upload_settings as UploadSettings
      this.lastUpdate = now
      return data.upload_settings as UploadSettings
    } catch {
      return DEFAULT_UPLOAD_SETTINGS
    }
  }

  async updateUploadSettings(settings: Partial<UploadSettings>): Promise<UploadSettings | null> {
    if (!isSupabaseConfigured()) return null
    const user = await this.getCurrentUser()
    if (!user) return null
      const currentSettings = await this.getUploadSettings()
    const updatedSettings = { ...currentSettings, ...settings }
    const { data: existingSettings } = await getSupabaseClient().from('user_settings').select('id').eq('id', user.id).maybeSingle()
    const settingsData = { upload_settings: updatedSettings, updated_at: new Date().toISOString() }
        if (!existingSettings) {
      const insertData = { ...settingsData, id: user.id, created_at: new Date().toISOString() }
      const { error } = await getSupabaseClient().from('user_settings').insert(insertData)
      if (error) return null
      this.cache.upload = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
            } else {
      const { error } = await getSupabaseClient().from('user_settings').update(settingsData).eq('id', user.id)
      if (error) return null
      this.cache.upload = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
    }
  }

  async getDisplaySettings(): Promise<DisplaySettings> {
    const now = Date.now()
    if (this.cache.display && now - this.lastUpdate < this.CACHE_TTL) return this.cache.display
    if (!isSupabaseConfigured()) return DEFAULT_DISPLAY_SETTINGS
    const user = await this.getCurrentUser()
    if (!user) return DEFAULT_DISPLAY_SETTINGS
    try {
      const { data, error } = await getSupabaseClient().from('user_settings').select('display_settings').eq('id', user.id).single()
      if (error || !data) return DEFAULT_DISPLAY_SETTINGS
      this.cache.display = data.display_settings as DisplaySettings
      this.lastUpdate = now
      return data.display_settings as DisplaySettings
    } catch {
      return DEFAULT_DISPLAY_SETTINGS
    }
  }

  async updateDisplaySettings(settings: Partial<DisplaySettings>): Promise<DisplaySettings | null> {
    if (!isSupabaseConfigured()) return null
    const user = await this.getCurrentUser()
    if (!user) return null
      const currentSettings = await this.getDisplaySettings()
    const updatedSettings = { ...currentSettings, ...settings }
    const { data: existingSettings } = await getSupabaseClient().from('user_settings').select('id').eq('id', user.id).maybeSingle()
    const settingsData = { display_settings: updatedSettings, updated_at: new Date().toISOString() }
        if (!existingSettings) {
      const insertData = { ...settingsData, id: user.id, created_at: new Date().toISOString() }
      const { error } = await getSupabaseClient().from('user_settings').insert(insertData)
      if (error) return null
      this.cache.display = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
            } else {
      const { error } = await getSupabaseClient().from('user_settings').update(settingsData).eq('id', user.id)
      if (error) return null
      this.cache.display = updatedSettings
      this.lastUpdate = Date.now()
      return updatedSettings
    }
  }

  async createDefaultSettings(): Promise<boolean> {
    if (!isSupabaseConfigured()) return false
    const user = await this.getCurrentUser()
    if (!user) return false
    const { data: existingSettings } = await getSupabaseClient().from('user_settings').select('id').eq('id', user.id).maybeSingle()
    if (existingSettings) return true
      const defaultSettings = {
        id: user.id,
        ocr_settings: DEFAULT_OCR_SETTINGS,
        processing_settings: DEFAULT_PROCESSING_SETTINGS,
        upload_settings: DEFAULT_UPLOAD_SETTINGS,
        display_settings: DEFAULT_DISPLAY_SETTINGS,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
    const { error } = await getSupabaseClient().from('user_settings').insert(defaultSettings)
    if (error) return false
    return true
  }
}

export const userSettingsService = new UserSettingsService()
