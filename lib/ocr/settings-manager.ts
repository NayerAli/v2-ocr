import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";

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
 * Load settings from localStorage if available
 */
export function loadSettings(): void {
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
    }
  } catch (error) {
    console.error('[SettingsManager] Failed to load settings:', error);
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