import type { Language } from "@/lib/i18n/translations"

declare module "@/lib/file-utils" {
  export function formatFileSize(bytes: number, language?: Language): string
  export function formatTimestamp(timestamp: number): string
}