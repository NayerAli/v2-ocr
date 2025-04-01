'use client'

import { useEffect } from 'react'
import { toast } from '@/hooks/use-toast'
import { Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react'
import { isSupabaseEnabled } from './supabase'
import { useSettings } from '@/store/settings'
import { renderNetworkToast } from '@/components/ui/network-toast'
import type { LucideIcon } from 'lucide-react'

interface NetworkState {
  isOnline: boolean
  isSupabaseConnected: boolean
  lastNotificationTime: number
}

// Network notification type
export type NetworkNotificationType = 'online' | 'offline' | 'supabase-connected' | 'supabase-disconnected';

// Interface for notification definition
export interface NetworkNotificationInfo {
  title: string;
  description: string;
  icon: LucideIcon;
  variant: 'default' | 'destructive' | 'warning';
}

// Minimum time between notifications (to prevent notification spam)
const MIN_NOTIFICATION_INTERVAL = 10000 // 10 seconds

// In-memory state to track network status
const state: NetworkState = {
  isOnline: true,
  isSupabaseConnected: false,
  lastNotificationTime: 0
}

// Define notification content based on type
const NOTIFICATIONS: Record<NetworkNotificationType, NetworkNotificationInfo> = {
  online: {
    title: 'Back Online',
    description: 'Your internet connection has been restored.',
    icon: Wifi,
    variant: 'default'
  },
  offline: {
    title: 'You\'re Offline',
    description: 'Working in offline mode. Changes will sync when you reconnect.',
    icon: WifiOff,
    variant: 'destructive'
  },
  'supabase-connected': {
    title: 'Connected to Supabase',
    description: 'Your data will now sync with the cloud.',
    icon: Cloud,
    variant: 'default'
  },
  'supabase-disconnected': {
    title: 'Supabase Disconnected',
    description: 'Working with local data only. Changes will sync when connection is restored.',
    icon: CloudOff,
    variant: 'warning'
  }
};

/**
 * Shows a toast notification about network status
 */
function showNetworkNotification(
  type: NetworkNotificationType,
  options: { showOnce?: boolean; autoClose?: boolean } = {}
) {
  const now = Date.now()
  
  // If we should throttle notifications to prevent spam
  if (now - state.lastNotificationTime < MIN_NOTIFICATION_INTERVAL) {
    return
  }
  
  // Update last notification time
  state.lastNotificationTime = now
  
  const notification = NOTIFICATIONS[type];
  
  // Show toast notification using the renderer
  toast({
    title: renderNetworkToast(notification.title, notification.icon),
    description: notification.description,
    variant: notification.variant,
    duration: options.autoClose ? 5000 : Infinity
  })
}

/**
 * Checks if Supabase is connected
 */
async function checkSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseEnabled()) return false
  
  try {
    // Dynamically import to avoid SSR issues
    const { getSupabaseClient } = await import('./supabase')
    const supabase = getSupabaseClient()
    
    // Simple ping to check connection
    const { error } = await supabase.from('documents').select('id').limit(1)
    
    return !error
  } catch (error) {
    console.error('Error checking Supabase connection:', error)
    return false
  }
}

/**
 * Hook to set up network status notifications
 */
export function useNetworkNotifications() {
  const { database } = useSettings()
  
  useEffect(() => {
    // Set initial state
    state.isOnline = navigator.onLine
    
    // Handler for when we go online
    const handleOnline = async () => {
      const wasOffline = !state.isOnline
      state.isOnline = true
      
      // Show notification if we were previously offline
      if (wasOffline) {
        showNetworkNotification('online', { autoClose: true })
      }
      
      // If using Supabase, check its connection
      if (database.preferredProvider === 'supabase' && isSupabaseEnabled()) {
        const isSupabaseConnected = await checkSupabaseConnection()
        
        // If Supabase status changed, show notification
        if (isSupabaseConnected && !state.isSupabaseConnected) {
          showNetworkNotification('supabase-connected', { autoClose: true })
        } else if (!isSupabaseConnected && state.isSupabaseConnected) {
          showNetworkNotification('supabase-disconnected', { autoClose: false })
        }
        
        state.isSupabaseConnected = isSupabaseConnected
      }
    }
    
    // Handler for when we go offline
    const handleOffline = () => {
      const wasOnline = state.isOnline
      state.isOnline = false
      state.isSupabaseConnected = false
      
      // Show notification if we were previously online
      if (wasOnline) {
        showNetworkNotification('offline', { autoClose: false })
      }
    }
    
    // Periodically check Supabase connection if we're online and using Supabase
    const checkSupabaseInterval = setInterval(async () => {
      if (
        state.isOnline && 
        database.preferredProvider === 'supabase' && 
        isSupabaseEnabled()
      ) {
        const isSupabaseConnected = await checkSupabaseConnection()
        
        // If Supabase status changed, show notification
        if (isSupabaseConnected && !state.isSupabaseConnected) {
          showNetworkNotification('supabase-connected', { autoClose: true })
        } else if (!isSupabaseConnected && state.isSupabaseConnected) {
          showNetworkNotification('supabase-disconnected', { autoClose: false })
        }
        
        state.isSupabaseConnected = isSupabaseConnected
      }
    }, 30000) // Check every 30 seconds
    
    // Register event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Initial check
    handleOnline()
    
    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(checkSupabaseInterval)
    }
  }, [database.preferredProvider])
  
  return null
}

/**
 * Manually trigger a network status notification
 */
export function notifyNetworkStatus(
  type: NetworkNotificationType,
  options: { showOnce?: boolean; autoClose?: boolean } = {}
) {
  showNetworkNotification(type, options)
} 