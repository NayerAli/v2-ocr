import { create } from "zustand"
import { persist } from "zustand/middleware"
import { CONFIG } from "@/config/constants"
import type { OCRSettings, ExportSettings } from "@/types"

interface SettingsState {
  ocr: OCRSettings
  export: ExportSettings
  updateOCRSettings: (settings: Partial<OCRSettings>) => void
  updateExportSettings: (settings: Partial<ExportSettings>) => void
  resetSettings: () => void
}

const defaultSettings = {
  ocr: {
    provider: "google" as const,
    apiKey: "",
    endpoint: "",
    region: "",
    language: CONFIG.DEFAULT_LANGUAGE,
    features: [],
  },
  export: {
    format: "txt" as const,
    naming: "{filename}-{timestamp}",
    location: "downloads",
    autoExport: false,
  },
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      updateOCRSettings: (settings) => set((state) => ({ ocr: { ...state.ocr, ...settings } })),
      updateExportSettings: (settings) => set((state) => ({ export: { ...state.export, ...settings } })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "pdf-ocr-settings",
    },
  ),
)

