import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import { userSettingsService } from "@/lib/user-settings-service";

interface ServiceSettings {
  ocr: OCRSettings;
  processing: ProcessingSettings;
  upload: UploadSettings;
}

// Default settings
const DEFAULT_OCR_SETTINGS: OCRSettings = {
  provider: "mistral",
  apiKey: "",
  region: "",
  language: "en"
};

const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = {
  maxConcurrentJobs: 2,
  pagesPerChunk: 2,
  concurrentChunks: 1,
  retryAttempts: 2,
  retryDelay: 1000
};

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  maxSimultaneousUploads: 5
};

// Current settings state
let currentSettings: ServiceSettings = {
  ocr: DEFAULT_OCR_SETTINGS,
  processing: DEFAULT_PROCESSING_SETTINGS,
  upload: DEFAULT_UPLOAD_SETTINGS,
};

// Settings change subscribers
type SettingsChangeListener = (settings: ServiceSettings) => void;
const listeners: Set<SettingsChangeListener> = new Set();

/**
 * Get the current settings
 */
export function getSettings(): ServiceSettings {
  return { ...currentSettings };
}

/**
 * Update OCR settings
 */
export function updateOCRSettings(settings: Partial<OCRSettings>): void {
  currentSettings = {
    ...currentSettings,
    ocr: {
      ...currentSettings.ocr,
      ...settings,
    },
  };

  // Also update user settings in the database
  userSettingsService.updateOCRSettings(settings).catch(error => {
    console.error('[SettingsManager] Failed to update user OCR settings:', error);
  });

  notifyListeners();
}

/**
 * Update processing settings
 */
export function updateProcessingSettings(settings: Partial<ProcessingSettings>): void {
  currentSettings = {
    ...currentSettings,
    processing: {
      ...currentSettings.processing,
      ...settings,
    },
  };

  // Also update user settings in the database
  userSettingsService.updateProcessingSettings(settings).catch(error => {
    console.error('[SettingsManager] Failed to update user processing settings:', error);
  });

  notifyListeners();
}

/**
 * Update upload settings
 */
export function updateUploadSettings(settings: Partial<UploadSettings>): void {
  currentSettings = {
    ...currentSettings,
    upload: {
      ...currentSettings.upload,
      ...settings,
    },
  };

  // Also update user settings in the database
  userSettingsService.updateUploadSettings(settings).catch(error => {
    console.error('[SettingsManager] Failed to update user upload settings:', error);
  });

  notifyListeners();
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): void {
  currentSettings = {
    ocr: DEFAULT_OCR_SETTINGS,
    processing: DEFAULT_PROCESSING_SETTINGS,
    upload: DEFAULT_UPLOAD_SETTINGS,
  };

  // Also reset user settings in the database
  Promise.all([
    userSettingsService.updateOCRSettings(DEFAULT_OCR_SETTINGS),
    userSettingsService.updateProcessingSettings(DEFAULT_PROCESSING_SETTINGS),
    userSettingsService.updateUploadSettings(DEFAULT_UPLOAD_SETTINGS)
  ]).catch(error => {
    console.error('[SettingsManager] Failed to reset user settings:', error);
  });

  notifyListeners();
}

/**
 * Subscribe to settings changes
 */
export function subscribeToSettingsChanges(listener: SettingsChangeListener): () => void {
  listeners.add(listener);

  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Load settings from user settings service and fall back to localStorage
 */
export async function loadSettings(): Promise<void> {
  try {
    // Try to load from user settings service first
    const ocrSettings = await userSettingsService.getOCRSettings();
    const processingSettings = await userSettingsService.getProcessingSettings();
    const uploadSettings = await userSettingsService.getUploadSettings();

    // Update current settings with user settings
    currentSettings = {
      ocr: { ...DEFAULT_OCR_SETTINGS, ...ocrSettings },
      processing: { ...DEFAULT_PROCESSING_SETTINGS, ...processingSettings },
      upload: { ...DEFAULT_UPLOAD_SETTINGS, ...uploadSettings },
    };

    // Notify listeners of the updated settings
    notifyListeners();

    console.log('[SettingsManager] Loaded settings from user settings service');
  } catch (error) {
    console.error('[SettingsManager] Failed to load from user settings service:', error);

    // Fall back to localStorage
    if (typeof window === 'undefined') return;

    try {
      const savedSettings = localStorage.getItem('ocr-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings) as Partial<ServiceSettings>;

        currentSettings = {
          ocr: { ...DEFAULT_OCR_SETTINGS, ...parsed.ocr },
          processing: { ...DEFAULT_PROCESSING_SETTINGS, ...parsed.processing },
          upload: { ...DEFAULT_UPLOAD_SETTINGS, ...parsed.upload },
        };

        console.log('[SettingsManager] Loaded settings from localStorage');
      }
    } catch (localStorageError) {
      console.error('[SettingsManager] Failed to load settings from localStorage:', localStorageError);
    }
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('ocr-settings', JSON.stringify(currentSettings));
  } catch (error) {
    console.error('[SettingsManager] Failed to save settings:', error);
  }
}

// Notify all listeners of settings changes
function notifyListeners(): void {
  const settings = getSettings();
  listeners.forEach(listener => {
    try {
      listener(settings);
    } catch (error) {
      console.error('[SettingsManager] Error in settings change listener:', error);
    }
  });

  // Save settings to localStorage
  saveSettings();
}