'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { useSettings } from '@/store/settings'
import { isSupabaseEnabled } from '@/lib/supabase'

interface NetworkStatusProps {
  className?: string
  showTooltip?: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

/**
 * Network status indicator component
 * Shows the current connection status for both internet and Supabase
 */
export function NetworkStatus({
  className = '',
  showTooltip = true,
  size = 'md',
  showLabel = false
}: NetworkStatusProps) {
  const [isOnline, setIsOnline] = useState(true)
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false)
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null)
  const [isCheckingSupabase, setIsCheckingSupabase] = useState(false)
  const { database } = useSettings()
  
  // Icon sizes based on the size prop
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }
  
  // Text sizes based on the size prop
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }
  
  // Check online status
  useEffect(() => {
    // Set initial status
    setIsOnline(navigator.onLine)
    
    // Create handlers
    const handleOnline = () => {
      setIsOnline(true)
      setLastOnlineTime(new Date())
    }
    
    const handleOffline = () => {
      setIsOnline(false)
    }
    
    // Register event handlers
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Check Supabase connection if enabled
    checkSupabaseConnection()
    
    // Set up periodic Supabase connection check
    const intervalId = setInterval(checkSupabaseConnection, 30000) // Check every 30 seconds
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // Check Supabase connection when database settings change
  useEffect(() => {
    checkSupabaseConnection()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database])
  
  // Function to check Supabase connection
  const checkSupabaseConnection = async () => {
    if (!isSupabaseEnabled() || database.preferredProvider !== 'supabase') {
      setIsSupabaseConnected(false)
      return
    }
    
    try {
      setIsCheckingSupabase(true)
      
      // Import dynamically to avoid issues with SSR
      const { getSupabaseClient } = await import('@/lib/supabase')
      const supabase = getSupabaseClient()
      
      // Simple ping to check connection
      const { error } = await supabase.from('documents').select('id').limit(1)
      
      // If successful, check settings table too for comprehensive check
      if (!error) {
        const { error: settingsError } = await supabase.from('settings').select('key').limit(1)
        setIsSupabaseConnected(!settingsError)
      } else {
        setIsSupabaseConnected(false)
      }
    } catch (error) {
      console.error('Error checking Supabase connection:', error)
      setIsSupabaseConnected(false)
    } finally {
      setIsCheckingSupabase(false)
    }
  }
  
  // Get status text and icon
  const getNetworkStatusInfo = () => {
    const isUsingSupabase = database.preferredProvider === 'supabase' && isSupabaseEnabled()
    
    if (!isOnline) {
      return {
        text: 'Offline',
        icon: <WifiOff className={`${iconSizes[size]} text-destructive`} />,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        tooltipText: 'You are offline. Please check your internet connection.'
      }
    }
    
    if (isUsingSupabase && isCheckingSupabase) {
      return {
        text: 'Connecting...',
        icon: <Cloud className={`${iconSizes[size]} text-amber-500 animate-pulse`} />,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        tooltipText: 'Connecting to Supabase...'
      }
    }
    
    if (isUsingSupabase && !isSupabaseConnected) {
      return {
        text: 'Supabase Disconnected',
        icon: <CloudOff className={`${iconSizes[size]} text-destructive`} />,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        tooltipText: 'Connected to the internet but unable to reach Supabase. Make sure your Docker containers are running.'
      }
    }
    
    if (isUsingSupabase && isSupabaseConnected) {
      return {
        text: 'Supabase Connected',
        icon: <Cloud className={`${iconSizes[size]} text-green-500`} />,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
        tooltipText: 'Connected to Supabase cloud storage. Your data will sync across devices.'
      }
    }
    
    return {
      text: 'Local Storage',
      icon: <Wifi className={`${iconSizes[size]} text-green-500`} />,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      tooltipText: 'Using local storage (IndexedDB). Your data is stored only on this device.'
    }
  }
  
  const statusInfo = getNetworkStatusInfo()
  
  // Last online time display
  const getLastOnlineText = () => {
    if (isOnline || !lastOnlineTime) return null
    
    const timeAgo = Math.floor((Date.now() - lastOnlineTime.getTime()) / 1000 / 60)
    
    if (timeAgo < 1) return 'Last online less than a minute ago'
    if (timeAgo === 1) return 'Last online 1 minute ago'
    if (timeAgo < 60) return `Last online ${timeAgo} minutes ago`
    
    const hoursAgo = Math.floor(timeAgo / 60)
    if (hoursAgo === 1) return 'Last online 1 hour ago'
    if (hoursAgo < 24) return `Last online ${hoursAgo} hours ago`
    
    const daysAgo = Math.floor(hoursAgo / 24)
    if (daysAgo === 1) return 'Last online 1 day ago'
    return `Last online ${daysAgo} days ago`
  }
  
  const lastOnlineText = getLastOnlineText()
  
  const content = (
    <div className={`flex items-center gap-1.5 ${className} ${!showLabel ? statusInfo.bgColor : ''} ${!showLabel ? 'rounded-full p-1.5' : ''}`}>
      {statusInfo.icon}
      {showLabel && (
        <span className={`${textSizes[size]} ${statusInfo.color}`}>
          {statusInfo.text}
        </span>
      )}
    </div>
  )
  
  if (!showTooltip) {
    return content
  }
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-3">
          <div className="space-y-2">
            <p className="font-semibold">{statusInfo.text}</p>
            <p className="text-xs text-muted-foreground">{statusInfo.tooltipText}</p>
            {lastOnlineText && (
              <p className="text-xs italic">{lastOnlineText}</p>
            )}
            {isCheckingSupabase && (
              <p className="text-xs text-muted-foreground">Checking Supabase connection...</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} 