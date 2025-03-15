import fs from 'fs/promises';
import path from 'path';
import { SettingsState } from '@/types/settings';
import { supabase, withSupabaseFallback } from '../supabase';
import { Json } from '@/types/supabase';

// Settings file path
const SETTINGS_FILE = path.join(process.cwd(), '.db', 'settings.json');

// Cache settings in memory
let settingsCache: Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

// Default settings
const defaultSettings: Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'> = {
  ocr: {
    provider: "google" as const,
    apiKey: "",
    region: "",
    language: "en",
  },
  processing: {
    maxConcurrentJobs: 1,
    pagesPerChunk: 2,
    concurrentChunks: 1,
    retryAttempts: 2,
    retryDelay: 1000
  },
  upload: {
    maxFileSize: 500,
    allowedFileTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSimultaneousUploads: 5
  },
  display: {
    theme: 'system',
    fontSize: 14,
    showConfidenceScores: true,
    highlightUncertain: true
  },
  database: {
    autoCleanup: false,
    cleanupThreshold: 90,
    retentionPeriod: 30,
    maxStorageSize: 1000
  },
  export: {
    format: 'txt' as const,
    naming: '{filename}-{timestamp}'
  },
  isLoading: false,
  error: null,
  initialize: async () => {}
};

// Ensure settings directory exists
async function ensureSettingsDirectory() {
  try {
    const dbDir = path.join(process.cwd(), '.db');
    await fs.mkdir(dbDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create settings directory:', error);
  }
}

// Get settings from file or create default
export async function getSettings(): Promise<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>> {
  console.log('[Settings] Getting settings, cache age:', Date.now() - cacheTimestamp);
  
  // Return cached settings if they exist and are less than 5 minutes old
  if (settingsCache && Date.now() - cacheTimestamp < 5 * 60 * 1000) {
    console.log('[Settings] Returning cached settings');
    return settingsCache;
  }

  return withSupabaseFallback(
    // Supabase implementation
    async () => {
      console.log('[Settings] Fetching settings from database');
      const { data: settingsData, error } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['ocr', 'processing', 'upload', 'display', 'database', 'export']);

      if (error) {
        console.error('[Settings] Error fetching settings:', error);
        throw new Error('Failed to fetch settings');
      }

      // Convert settings data to object
      const settings = settingsData.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, any>);

      console.log('[Settings] Database settings:', {
        hasOCR: !!settings.ocr,
        hasApiKey: settings.ocr?.apiKey ? '***' : 'not set',
        provider: settings.ocr?.provider
      });

      // Merge with default settings
      const mergedSettings = {
        ...defaultSettings,
        ocr: { ...defaultSettings.ocr, ...settings.ocr },
        processing: { ...defaultSettings.processing, ...settings.processing },
        upload: { ...defaultSettings.upload, ...settings.upload },
        display: { ...defaultSettings.display, ...settings.display },
        database: { ...defaultSettings.database, ...settings.database },
        export: { ...defaultSettings.export, ...settings.export },
      };

      // Update cache
      settingsCache = mergedSettings;
      cacheTimestamp = Date.now();

      console.log('[Settings] Settings loaded successfully:', {
        hasApiKey: !!mergedSettings.ocr.apiKey,
        provider: mergedSettings.ocr.provider
      });

      return mergedSettings;
    },
    // Fallback to default settings
    () => {
      console.log('[Settings] Using default settings (fallback)');
      return defaultSettings;
    }
  );
}

// Update settings
export async function updateSettings(updatedSettings: Partial<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>>): Promise<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>> {
  console.log('[Settings] Updating server settings:', {
    updatingOCR: !!updatedSettings.ocr,
    newApiKey: updatedSettings.ocr?.apiKey ? '***' : undefined,
    currentApiKey: settingsCache?.ocr.apiKey ? '***' : 'not set'
  });

  return withSupabaseFallback(
    // Supabase implementation
    async () => {
      // Get current settings
      const currentSettings = await getSettings();
      
      // Special handling for OCR settings to ensure API key is properly stored
      if (updatedSettings.ocr?.apiKey !== undefined) {
        console.log('[Settings] Updating OCR API key');
        const { error } = await supabase
          .from('settings')
          .upsert({ 
            key: 'ocr', 
            value: {
              ...currentSettings.ocr,
              ...updatedSettings.ocr,
              apiKey: updatedSettings.ocr.apiKey
            } as unknown as Json,
            updated_at: new Date().toISOString()
          });
        
        if (error) {
          console.error('[Settings] Error updating OCR settings:', error);
          throw new Error('Failed to update OCR settings');
        }
      }
      
      // Merge with updated settings
      const newSettings = {
        ...currentSettings,
        ...updatedSettings,
        // Handle nested updates
        ...(updatedSettings.ocr && { ocr: { ...currentSettings.ocr, ...updatedSettings.ocr } }),
        ...(updatedSettings.processing && { processing: { ...currentSettings.processing, ...updatedSettings.processing } }),
        ...(updatedSettings.upload && { upload: { ...currentSettings.upload, ...updatedSettings.upload } }),
        ...(updatedSettings.display && { display: { ...currentSettings.display, ...updatedSettings.display } }),
        ...(updatedSettings.database && { database: { ...currentSettings.database, ...updatedSettings.database } }),
        ...(updatedSettings.export && { export: { ...currentSettings.export, ...updatedSettings.export } }),
      };
      
      // Update each setting in Supabase
      const updates = [];
      
      if (updatedSettings.processing) {
        updates.push(supabase
          .from('settings')
          .upsert({ 
            key: 'processing', 
            value: newSettings.processing as unknown as Json,
            updated_at: new Date().toISOString()
          }));
      }
      
      if (updatedSettings.upload) {
        updates.push(supabase
          .from('settings')
          .upsert({ 
            key: 'upload', 
            value: newSettings.upload as unknown as Json,
            updated_at: new Date().toISOString()
          }));
      }
      
      if (updatedSettings.display) {
        updates.push(supabase
          .from('settings')
          .upsert({ 
            key: 'display', 
            value: newSettings.display as unknown as Json,
            updated_at: new Date().toISOString()
          }));
      }
      
      if (updatedSettings.database) {
        updates.push(supabase
          .from('settings')
          .upsert({ 
            key: 'database', 
            value: newSettings.database as unknown as Json,
            updated_at: new Date().toISOString()
          }));
      }
      
      if (updatedSettings.export) {
        updates.push(supabase
          .from('settings')
          .upsert({ 
            key: 'export', 
            value: newSettings.export as unknown as Json,
            updated_at: new Date().toISOString()
          }));
      }
      
      if (updates.length > 0) {
        await Promise.all(updates);
      }
      
      // Update cache immediately
      settingsCache = newSettings;
      cacheTimestamp = Date.now();
      
      console.log('[Settings] Settings updated successfully:', {
        hasApiKey: !!newSettings.ocr.apiKey,
        provider: newSettings.ocr.provider
      });
      
      return newSettings;
    },
    // Fallback file-based implementation
    async () => {
      try {
        await ensureSettingsDirectory();
        
        // Get current settings
        const currentSettings = await getSettings();
        
        // Merge with updated settings
        const newSettings = {
          ...currentSettings,
          ...updatedSettings,
          // Handle nested updates
          ...(updatedSettings.ocr && { ocr: { ...currentSettings.ocr, ...updatedSettings.ocr } }),
          ...(updatedSettings.processing && { processing: { ...currentSettings.processing, ...updatedSettings.processing } }),
          ...(updatedSettings.upload && { upload: { ...currentSettings.upload, ...updatedSettings.upload } }),
          ...(updatedSettings.display && { display: { ...currentSettings.display, ...updatedSettings.display } }),
          ...(updatedSettings.database && { database: { ...currentSettings.database, ...updatedSettings.database } }),
          ...(updatedSettings.export && { export: { ...currentSettings.export, ...updatedSettings.export } }),
        };
        
        // Write to file
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
        
        // Update cache immediately
        settingsCache = newSettings;
        cacheTimestamp = Date.now();
        
        console.log('[Settings] Settings updated successfully (file-based):', {
          hasApiKey: !!newSettings.ocr.apiKey,
          provider: newSettings.ocr.provider
        });
        
        return newSettings;
      } catch (error) {
        console.error('Error updating settings:', error);
        throw new Error('Failed to update settings');
      }
    }
  );
}

// Reset settings to default
export async function resetSettings(): Promise<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>> {
  return withSupabaseFallback(
    // Supabase implementation
    async () => {
      // Delete all settings
      await Promise.all([
        supabase.from('settings').delete().eq('key', 'ocr'),
        supabase.from('settings').delete().eq('key', 'processing'),
        supabase.from('settings').delete().eq('key', 'upload'),
        supabase.from('settings').delete().eq('key', 'display'),
        supabase.from('settings').delete().eq('key', 'database'),
        supabase.from('settings').delete().eq('key', 'export')
      ]);
      
      // Insert default settings
      await Promise.all([
        supabase.from('settings').insert({ key: 'ocr', value: defaultSettings.ocr as unknown as Json }),
        supabase.from('settings').insert({ key: 'processing', value: defaultSettings.processing as unknown as Json }),
        supabase.from('settings').insert({ key: 'upload', value: defaultSettings.upload as unknown as Json }),
        supabase.from('settings').insert({ key: 'display', value: defaultSettings.display as unknown as Json }),
        supabase.from('settings').insert({ key: 'database', value: defaultSettings.database as unknown as Json }),
        supabase.from('settings').insert({ key: 'export', value: defaultSettings.export as unknown as Json })
      ]);
      
      // Update cache
      settingsCache = { ...defaultSettings };
      cacheTimestamp = Date.now();
      
      return defaultSettings;
    },
    // Fallback file-based implementation
    async () => {
      try {
        await ensureSettingsDirectory();
        
        // Write default settings to file
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
        
        // Update cache
        settingsCache = { ...defaultSettings };
        cacheTimestamp = Date.now();
        
        return defaultSettings;
      } catch (error) {
        console.error('Error resetting settings:', error);
        throw new Error('Failed to reset settings');
      }
    }
  );
} 