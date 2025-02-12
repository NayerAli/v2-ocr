import type { Language } from "@/lib/i18n/translations"

export function toArabicNumerals(num: number | string, language: Language): string {
  if (language !== 'ar' && language !== 'fa') return String(num)
  
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)])
}

export function formatFileSize(bytes: number, language?: Language): string {
  if (bytes === 0) return language ? toArabicNumerals(0, language) + ' B' : '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(2))
  
  return language ? `${toArabicNumerals(size, language)} ${sizes[i]}` : `${size} ${sizes[i]}`
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export type { Language } 