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
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
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
    cleanupThreshold: 90, // 90 days
    retentionPeriod: 30, // 30 days
    maxStorageSize: 1000 // 1GB
  },
  export: {
    format: 'txt' as const,
    naming: '{filename}-{timestamp}'
  }
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
  // Return cached settings if valid
  const now = Date.now();
  if (settingsCache && (now - cacheTimestamp < CACHE_TTL)) {
    return settingsCache;
  }
  
  return withSupabaseFallback(
    // Supabase implementation
    async () => {
      // Check if settings exists in Supabase
      const { data: ocr, error: ocrError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'ocr')
        .single();
      
      // If settings don't exist, create them
      if (ocrError || !ocr) {
        // Save default settings
        await Promise.all([
          supabase.from('settings').upsert({ key: 'ocr', value: defaultSettings.ocr as unknown as Json }),
          supabase.from('settings').upsert({ key: 'processing', value: defaultSettings.processing as unknown as Json }),
          supabase.from('settings').upsert({ key: 'upload', value: defaultSettings.upload as unknown as Json }),
          supabase.from('settings').upsert({ key: 'display', value: defaultSettings.display as unknown as Json }),
          supabase.from('settings').upsert({ key: 'database', value: defaultSettings.database as unknown as Json }),
          supabase.from('settings').upsert({ key: 'export', value: defaultSettings.export as unknown as Json })
        ]);
        
        // Update cache
        settingsCache = { ...defaultSettings };
        cacheTimestamp = now;
        
        return defaultSettings;
      }
      
      // Get all settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['ocr', 'processing', 'upload', 'display', 'database', 'export']);
      
      if (settingsError || !settingsData) {
        console.error('Error getting settings:', settingsError);
        return defaultSettings;
      }
      
      // Construct settings object
      const settings: any = { ...defaultSettings };
      
      settingsData.forEach(item => {
        if (item.key in settings) {
          settings[item.key] = item.value;
        }
      });
      
      // Update cache
      settingsCache = settings;
      cacheTimestamp = now;
      
      return settings;
    },
    // Fallback file-based implementation
    async () => {
      try {
        await ensureSettingsDirectory();
        
        // Check if settings file exists
        try {
          await fs.access(SETTINGS_FILE);
        } catch (error) {
          // Create default settings file if it doesn't exist
          await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
          settingsCache = { ...defaultSettings };
          cacheTimestamp = now;
          return defaultSettings;
        }
        
        // Read settings from file
        const settingsData = await fs.readFile(SETTINGS_FILE, 'utf-8');
        const settings = JSON.parse(settingsData);
        
        // Update cache
        settingsCache = settings;
        cacheTimestamp = now;
        
        return settings;
      } catch (error) {
        console.error('Error getting settings:', error);
        // Return default settings if there's an error
        return defaultSettings;
      }
    }
  );
}

// Update settings
export async function updateSettings(updatedSettings: Partial<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>>): Promise<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>> {
  return withSupabaseFallback(
    // Supabase implementation
    async () => {
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
      
      // Update each setting in Supabase
      const updates = [];
      
      if (updatedSettings.ocr) {
        updates.push(supabase
          .from('settings')
          .upsert({ 
            key: 'ocr', 
            value: newSettings.ocr as unknown as Json,
            updated_at: new Date().toISOString()
          }));
      }
      
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
      
      // Update cache
      settingsCache = newSettings;
      cacheTimestamp = Date.now();
      
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
        
        // Update cache
        settingsCache = newSettings;
        cacheTimestamp = Date.now();
        
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