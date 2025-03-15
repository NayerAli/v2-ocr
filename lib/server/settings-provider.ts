import { getSettings, updateSettings } from './settings'
import type { SettingsState } from '@/types/settings'

export class SettingsProvider {
  private static instance: SettingsProvider
  private settings: SettingsState | null = null
  private isLoading = false
  private error: Error | null = null
  private listeners: ((settings: SettingsState) => void)[] = []

  private constructor() {}

  static getInstance(): SettingsProvider {
    if (!SettingsProvider.instance) {
      SettingsProvider.instance = new SettingsProvider()
    }
    return SettingsProvider.instance
  }

  async initialize(): Promise<void> {
    if (this.settings) return

    try {
      this.isLoading = true
      this.error = null
      console.log('[Settings] Initializing settings provider')
      
      // Load settings from server
      const serverSettings = await getSettings()
      
      // Initialize settings with server data
      this.settings = {
        ...serverSettings,
        isLoading: this.isLoading,
        error: this.error,
        updateOCRSettings: this.updateOCRSettings.bind(this),
        updateProcessingSettings: this.updateProcessingSettings.bind(this),
        updateUploadSettings: this.updateUploadSettings.bind(this),
        updateDisplaySettings: this.updateDisplaySettings.bind(this),
        updateDatabaseSettings: this.updateDatabaseSettings.bind(this),
        updateExportSettings: this.updateExportSettings.bind(this),
        resetSettings: this.resetSettings.bind(this),
        initialize: this.initialize.bind(this)
      }
      
      console.log('[Settings] Provider initialized with settings:', {
        hasApiKey: !!this.settings.ocr.apiKey,
        provider: this.settings.ocr.provider,
        language: this.settings.ocr.language
      })
      
      // Notify listeners
      this.notifyListeners()
    } catch (error) {
      this.error = error instanceof Error ? error : new Error('Failed to initialize settings')
      console.error('[Settings] Error initializing provider:', this.error)
      throw this.error
    } finally {
      this.isLoading = false
    }
  }

  getSettings(): SettingsState | null {
    return this.settings
  }

  subscribe(listener: (settings: SettingsState) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners(): void {
    if (!this.settings) return
    this.listeners.forEach(listener => listener(this.settings!))
  }

  private async updateSettings(partial: Partial<SettingsState>): Promise<void> {
    if (!this.settings) return

    try {
      console.log('[Settings] Updating settings:', {
        updatingOCR: !!partial.ocr,
        newApiKey: partial.ocr?.apiKey ? '***' : undefined,
        language: partial.ocr?.language
      })
      
      // Merge partial updates with current settings
      const mergedSettings = {
        ...this.settings,
        ocr: partial.ocr ? { ...this.settings.ocr, ...partial.ocr } : this.settings.ocr,
        processing: partial.processing ? { ...this.settings.processing, ...partial.processing } : this.settings.processing,
        upload: partial.upload ? { ...this.settings.upload, ...partial.upload } : this.settings.upload,
        display: partial.display ? { ...this.settings.display, ...partial.display } : this.settings.display,
        database: partial.database ? { ...this.settings.database, ...partial.database } : this.settings.database,
        export: partial.export ? { ...this.settings.export, ...partial.export } : this.settings.export,
      }
      
      // Update server settings
      const serverSettings = await updateSettings(mergedSettings)
      
      // Update local state
      this.settings = {
        ...this.settings,
        ...serverSettings,
        isLoading: this.isLoading,
        error: this.error,
        updateOCRSettings: this.updateOCRSettings.bind(this),
        updateProcessingSettings: this.updateProcessingSettings.bind(this),
        updateUploadSettings: this.updateUploadSettings.bind(this),
        updateDisplaySettings: this.updateDisplaySettings.bind(this),
        updateExportSettings: this.updateExportSettings.bind(this),
        resetSettings: this.resetSettings.bind(this),
        initialize: this.initialize.bind(this)
      }
      
      console.log('[Settings] Settings updated:', {
        hasApiKey: !!this.settings.ocr.apiKey,
        provider: this.settings.ocr.provider,
        language: this.settings.ocr.language
      })

      // Notify listeners
      this.notifyListeners()
    } catch (error) {
      this.error = error instanceof Error ? error : new Error('Failed to update settings')
      console.error('[Settings] Error updating settings:', this.error)
      throw this.error
    }
  }

  async updateOCRSettings(settings: Partial<SettingsState['ocr']>): Promise<void> {
    return this.updateSettings({ ocr: settings })
  }

  async updateProcessingSettings(settings: Partial<SettingsState['processing']>): Promise<void> {
    return this.updateSettings({ processing: settings })
  }

  async updateUploadSettings(settings: Partial<SettingsState['upload']>): Promise<void> {
    return this.updateSettings({ upload: settings })
  }

  async updateDisplaySettings(settings: Partial<SettingsState['display']>): Promise<void> {
    return this.updateSettings({ display: settings })
  }

  async updateDatabaseSettings(settings: Partial<SettingsState['database']>): Promise<void> {
    return this.updateSettings({ database: settings })
  }

  async updateExportSettings(settings: Partial<SettingsState['export']>): Promise<void> {
    return this.updateSettings({ export: settings })
  }

  async resetSettings(): Promise<void> {
    if (!this.settings) return

    try {
      // Reset server settings
      const serverSettings = await getSettings()
      
      // Reset local state
      this.settings = {
        ...serverSettings,
        isLoading: this.isLoading,
        error: this.error,
        updateOCRSettings: this.updateOCRSettings.bind(this),
        updateProcessingSettings: this.updateProcessingSettings.bind(this),
        updateUploadSettings: this.updateUploadSettings.bind(this),
        updateDisplaySettings: this.updateDisplaySettings.bind(this),
        updateDatabaseSettings: this.updateDatabaseSettings.bind(this),
        updateExportSettings: this.updateExportSettings.bind(this),
        resetSettings: this.resetSettings.bind(this),
        initialize: this.initialize.bind(this)
      }
      
      console.log('[Settings] Settings reset to defaults')

      // Notify listeners
      this.notifyListeners()
    } catch (error) {
      this.error = error instanceof Error ? error : new Error('Failed to reset settings')
      console.error('[Settings] Error resetting settings:', this.error)
      throw this.error
    }
  }
}