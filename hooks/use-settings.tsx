'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { 
  SettingsState, 
  OCRSettings, 
  ProcessingSettings, 
  UploadSettings, 
  DisplaySettings, 
  DatabaseSettings,
  ExportSettings
} from '@/types/settings';
import { useServerApi } from './use-server-api';
import { useToast } from './use-toast';

// Default settings (same as server-side)
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

// Create context
const SettingsContext = createContext<SettingsState | null>(null);

// Global settings state to prevent multiple instances from fetching settings
let globalSettingsLoaded = false;
let globalSettings: any = null;

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { getSettings, updateSettings: updateServerSettings, resetSettings: resetServerSettings } = useServerApi({
    onError: (error) => {
      toast({
        title: 'Settings Error',
        description: error.message,
        variant: 'destructive',
      });
    },
    debounceMs: 1000 // Increase debounce to 1 second
  });
  
  const [settings, setSettings] = useState<Omit<SettingsState, 'updateOCRSettings' | 'updateProcessingSettings' | 'updateUploadSettings' | 'updateDisplaySettings' | 'updateDatabaseSettings' | 'updateExportSettings' | 'resetSettings'>>(
    globalSettings || defaultSettings
  );
  const [isLoading, setIsLoading] = useState(!globalSettingsLoaded);
  const settingsLoaded = useRef(globalSettingsLoaded);
  const isMounted = useRef(true);
  
  // Set up cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Load settings from server only once on mount
  useEffect(() => {
    // Skip if settings are already loaded
    if (settingsLoaded.current) return;
    
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const serverSettings = await getSettings();
        
        if (isMounted.current) {
          setSettings(serverSettings);
          settingsLoaded.current = true;
          globalSettingsLoaded = true;
          globalSettings = serverSettings;
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };
    
    loadSettings();
  }, [getSettings]);
  
  // Update settings handlers with debounce
  const updateOCRSettings = useCallback(async (ocrSettings: Partial<OCRSettings>) => {
    try {
      const updatedSettings = await updateServerSettings({ ocr: ocrSettings });
      setSettings(updatedSettings);
      globalSettings = updatedSettings;
    } catch (error) {
      console.error('Failed to update OCR settings:', error);
    }
  }, [updateServerSettings]);
  
  const updateProcessingSettings = useCallback(async (processingSettings: Partial<ProcessingSettings>) => {
    try {
      const updatedSettings = await updateServerSettings({ processing: processingSettings });
      setSettings(updatedSettings);
      globalSettings = updatedSettings;
    } catch (error) {
      console.error('Failed to update processing settings:', error);
    }
  }, [updateServerSettings]);
  
  const updateUploadSettings = useCallback(async (uploadSettings: Partial<UploadSettings>) => {
    try {
      const updatedSettings = await updateServerSettings({ upload: uploadSettings });
      setSettings(updatedSettings);
      globalSettings = updatedSettings;
    } catch (error) {
      console.error('Failed to update upload settings:', error);
    }
  }, [updateServerSettings]);
  
  const updateDisplaySettings = useCallback(async (displaySettings: Partial<DisplaySettings>) => {
    try {
      const updatedSettings = await updateServerSettings({ display: displaySettings });
      setSettings(updatedSettings);
      globalSettings = updatedSettings;
    } catch (error) {
      console.error('Failed to update display settings:', error);
    }
  }, [updateServerSettings]);
  
  const updateDatabaseSettings = useCallback(async (databaseSettings: Partial<DatabaseSettings>) => {
    try {
      const updatedSettings = await updateServerSettings({ database: databaseSettings });
      setSettings(updatedSettings);
      globalSettings = updatedSettings;
    } catch (error) {
      console.error('Failed to update database settings:', error);
    }
  }, [updateServerSettings]);
  
  const updateExportSettings = useCallback(async (exportSettings: Partial<ExportSettings>) => {
    try {
      const updatedSettings = await updateServerSettings({ export: exportSettings });
      setSettings(updatedSettings);
      globalSettings = updatedSettings;
    } catch (error) {
      console.error('Failed to update export settings:', error);
    }
  }, [updateServerSettings]);
  
  const resetSettings = useCallback(async () => {
    try {
      const defaultSettings = await resetServerSettings();
      setSettings(defaultSettings);
      globalSettings = defaultSettings;
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }, [resetServerSettings]);
  
  // Combine settings with update functions
  const settingsWithFunctions: SettingsState = {
    ...settings,
    updateOCRSettings,
    updateProcessingSettings,
    updateUploadSettings,
    updateDisplaySettings,
    updateDatabaseSettings,
    updateExportSettings,
    resetSettings,
  };
  
  return (
    <SettingsContext.Provider value={settingsWithFunctions}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  
  return context;
} 