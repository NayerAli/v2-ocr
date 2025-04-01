'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NetworkStatus } from '@/components/ui/network-status'
import { notifyNetworkStatus } from '@/lib/network-notifications'

export function TestNetwork() {
  const [showError, setShowError] = useState(false)

  const triggerNetworkError = () => {
    throw new Error('Network request failed')
  }

  const showNotifications = () => {
    notifyNetworkStatus('offline', { autoClose: false })
    setTimeout(() => {
      notifyNetworkStatus('online', { autoClose: true })
    }, 2000)
    setTimeout(() => {
      notifyNetworkStatus('supabase-disconnected', { autoClose: false })
    }, 4000)
    setTimeout(() => {
      notifyNetworkStatus('supabase-connected', { autoClose: true })
    }, 6000)
  }

  return (
    <div className="space-y-8 p-4">
      <div className="flex items-center gap-4">
        <NetworkStatus showLabel size="md" />
        <span className="text-sm text-muted-foreground">
          Current network status indicator
        </span>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Network Error Boundary Testing</h3>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="destructive" 
            onClick={() => setShowError(true)}
          >
            Trigger Network Error
          </Button>
          
          <Button 
            variant="outline" 
            onClick={showNotifications}
          >
            Show Network Notifications
          </Button>
        </div>
        
        {showError && triggerNetworkError()}
      </div>
    </div>
  )
} 