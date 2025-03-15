'use client';

import { create } from 'zustand'
import type { SettingsState } from '@/types/settings'

interface SettingsStore extends SettingsState {
  isLoading: boolean
  error: Error | null
  initialize: () => Promise<void>
}

export const useSettings = create<SettingsStore>((set, get) => ({
  // Initial state
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
    cleanupThreshold: 90,
    retentionPeriod: 30,
    maxStorageSize: 1000
  },
  export: {
    format: 'txt' as const,
    naming: '{filename}-{timestamp}'
  },
  isLoading: true,
  error: null,

  // Initialize settings from server
  initialize: async () => {
    try {
      set({ isLoading: true, error: null })
      const response = await fetch('/api/settings')
      if (!response.ok) {
        throw new Error('Failed to fetch settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export,
        isLoading: false 
      })
    } catch (error) {
      set({ 
        error: error instanceof Error ? error : new Error('Failed to load settings'),
        isLoading: false 
      })
    }
  },

  // Update settings
  updateOCRSettings: async (settings) => {
    try {
      // If updating API key, send request immediately
      const method = settings.apiKey !== undefined ? 'PATCH' : 'POST'
      const response = await fetch('/api/settings', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocr: settings })
      })
      if (!response.ok) {
        throw new Error('Failed to update OCR settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to update OCR settings') })
    }
  },

  updateProcessingSettings: async (settings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processing: settings })
      })
      if (!response.ok) {
        throw new Error('Failed to update processing settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to update processing settings') })
    }
  },

  updateUploadSettings: async (settings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload: settings })
      })
      if (!response.ok) {
        throw new Error('Failed to update upload settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to update upload settings') })
    }
  },

  updateDisplaySettings: async (settings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display: settings })
      })
      if (!response.ok) {
        throw new Error('Failed to update display settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to update display settings') })
    }
  },

  updateDatabaseSettings: async (settings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: settings })
      })
      if (!response.ok) {
        throw new Error('Failed to update database settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to update database settings') })
    }
  },

  updateExportSettings: async (settings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ export: settings })
      })
      if (!response.ok) {
        throw new Error('Failed to update export settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to update export settings') })
    }
  },

  resetSettings: async () => {
    try {
      const response = await fetch('/api/settings/reset', {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error('Failed to reset settings')
      }
      const serverSettings = await response.json()
      
      // Get current state to preserve functions
      const currentState = get()
      
      // Update state with server settings while preserving functions
      set({ 
        ...currentState,
        ocr: serverSettings.ocr || currentState.ocr,
        processing: serverSettings.processing || currentState.processing,
        upload: serverSettings.upload || currentState.upload,
        display: serverSettings.display || currentState.display,
        database: serverSettings.database || currentState.database,
        export: serverSettings.export || currentState.export
      })
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error('Failed to reset settings') })
    }
  }
})) 