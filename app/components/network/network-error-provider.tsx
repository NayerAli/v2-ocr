'use client'

import { ReactNode } from 'react'
import { NetworkErrorBoundary } from '@/components/ui/network-error-boundary'
import { useNetworkNotifications } from '@/lib/network-notifications'

interface NetworkErrorProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the app with network error handling
 * and notifications for network status changes
 */
export function NetworkErrorProvider({ children }: NetworkErrorProviderProps) {
  // Set up network status notifications
  useNetworkNotifications()
  
  return (
    <NetworkErrorBoundary showReportButton>
      {children}
    </NetworkErrorBoundary>
  )
} 