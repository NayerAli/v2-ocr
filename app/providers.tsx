'use client'

import { useEffect } from 'react'
import { useSettings } from '@/hooks/use-settings'

export function Providers({ children }: { children: React.ReactNode }) {
  const settings = useSettings()

  // Initialize settings on app load
  useEffect(() => {
    settings.initialize()
  }, [])

  return <>{children}</>
}