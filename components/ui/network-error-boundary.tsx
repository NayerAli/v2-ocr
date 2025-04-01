'use client'

import { Component, ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Button } from './button'
import { Wifi, WifiOff } from 'lucide-react'
import { isSupabaseEnabled } from '@/lib/supabase'

interface NetworkErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onRetry?: () => void
  showReportButton?: boolean
}

interface NetworkErrorBoundaryState {
  hasError: boolean
  error: Error | null
  isOnline: boolean
}

/**
 * A React error boundary specifically for catching network-related errors
 * Displays appropriate error messages and recovery options based on the error type
 */
export class NetworkErrorBoundary extends Component<
  NetworkErrorBoundaryProps,
  NetworkErrorBoundaryState
> {
  constructor(props: NetworkErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      isOnline: true
    }
  }

  static getDerivedStateFromError(error: Error): NetworkErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      isOnline: navigator.onLine
    }
  }

  componentDidMount() {
    // Add event listeners for online/offline status
    window.addEventListener('online', this.handleOnlineStatus)
    window.addEventListener('offline', this.handleOnlineStatus)
    
    // Set initial online status
    this.setState({ isOnline: navigator.onLine })
  }
  
  componentWillUnmount() {
    // Remove event listeners
    window.removeEventListener('online', this.handleOnlineStatus)
    window.removeEventListener('offline', this.handleOnlineStatus)
  }

  handleOnlineStatus = () => {
    const isOnline = navigator.onLine
    this.setState({ isOnline })
    
    // If we're back online and had an error, attempt to recover
    if (isOnline && this.state.hasError) {
      this.handleRetry()
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    
    // Call onRetry if provided
    if (this.props.onRetry) {
      this.props.onRetry()
    }
  }

  isNetworkError(error: Error): boolean {
    // Check if this is a network-related error
    return (
      error.message.includes('network') ||
      error.message.includes('offline') ||
      error.message.includes('connection') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Network request failed') ||
      (isSupabaseEnabled() && 
        (error.message.includes('Supabase') || 
         error.message.includes('PostgreSQL')))
    )
  }

  render() {
    const { children, fallback } = this.props
    const { hasError, error, isOnline } = this.state
    
    // Handle non-network errors
    if (hasError && error && !this.isNetworkError(error)) {
      // Let React's default error boundary handle these
      throw error
    }
    
    // If we have a network error or are offline, show the error UI
    if (hasError || !isOnline) {
      if (fallback) {
        return fallback
      }
      
      return (
        <div className="w-full py-4 flex flex-col items-center justify-center">
          <Alert variant="destructive" className="max-w-md">
            <div className="flex items-center gap-2">
              {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <AlertTitle>
                {!isOnline 
                  ? "You're offline" 
                  : "Network connection error"}
              </AlertTitle>
            </div>
            <AlertDescription className="mt-2">
              {!isOnline 
                ? "Please check your internet connection and try again." 
                : error?.message || "There was an error connecting to the server. Please try again."}
            </AlertDescription>
            <div className="mt-4 flex justify-end gap-2">
              {this.props.showReportButton && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // Implement error reporting here
                    console.error('[ErrorReport]', error)
                    alert('Error reported. Thank you!')
                  }}
                >
                  Report Issue
                </Button>
              )}
              <Button 
                variant="default" 
                size="sm"
                onClick={this.handleRetry}
              >
                Try Again
              </Button>
            </div>
          </Alert>
        </div>
      )
    }
    
    return children
  }
} 