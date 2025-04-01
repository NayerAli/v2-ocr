"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle, Database, AlertCircle, CloudOff, Cloud } from "lucide-react"
import { useSettings } from "@/store/settings"
import { isSupabaseEnabled } from "@/lib/supabase"
import { canSwitchProvider } from "@/lib/db-factory"
import { useToast } from "@/hooks/use-toast"

interface SupabaseSettingsProps {
  onClose?: () => void
}

export function SupabaseSettings({ onClose }: SupabaseSettingsProps) {
  const settings = useSettings()
  const { toast } = useToast()
  const [isSupabaseAvailable, setIsSupabaseAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'success' | 'error'>(
    // Initialize from stored value if available
    settings.database.connectionStatus || 'untested'
  )

  // Check if Supabase is available
  useEffect(() => {
    setIsSupabaseAvailable(isSupabaseEnabled())
    
    // Auto-check connection when component mounts if set to use Supabase
    if (settings.database.preferredProvider === 'supabase' && 
        settings.database.connectionStatus !== 'success' && 
        !isTestingConnection) {
      testConnection();
    }
  }, []);

  // Update the connection status in settings store when it changes
  useEffect(() => {
    if (connectionStatus !== settings.database.connectionStatus) {
      settings.updateDatabaseSettings({
        ...settings.database,
        connectionStatus
      });
    }
  }, [connectionStatus]);

  // Handle provider toggle
  const handleProviderToggle = (enabled: boolean) => {
    if (enabled && !canSwitchProvider('supabase')) {
      toast({
        title: "Cannot enable Supabase",
        description: "Supabase is not properly configured. Please check your environment variables.",
        variant: "destructive"
      })
      return
    }

    settings.updateDatabaseSettings({
      preferredProvider: enabled ? 'supabase' : 'local'
    })

    if (enabled) {
      toast({
        title: "Supabase enabled",
        description: "Your application is now using Supabase for data storage."
      })
    } else {
      toast({
        title: "Local storage enabled",
        description: "Your application is now using IndexedDB for local data storage."
      })
    }
  }

  // Test connection to Supabase
  const testConnection = async () => {
    setIsTestingConnection(true)
    setConnectionStatus('untested')

    try {
      // Import dynamically to avoid server-side errors
      const { getSupabaseClient } = await import('@/lib/supabase')
      const supabase = getSupabaseClient()
      
      // Try to query the database
      const { error } = await supabase.from('documents').select('id').limit(1)
      
      if (error) {
        throw error
      }
      
      // Also try to connect to the settings table to verify permissions
      const { error: settingsError } = await supabase.from('settings').select('key').limit(1)
      
      if (settingsError) {
        throw new Error(`Connected to Supabase but couldn't access settings table: ${settingsError.message}`)
      }
      
      setConnectionStatus('success')
      toast({
        title: "Connection successful",
        description: "Successfully connected to Supabase."
      })
    } catch (error) {
      console.error("Supabase connection error:", error)
      setConnectionStatus('error')
      
      // Provide more specific error messages based on the error type
      let errorMessage = "Failed to connect to Supabase."
      
      if (error instanceof Error) {
        // Check for common connection errors
        if (error.message.includes("Failed to fetch")) {
          errorMessage = "Network error: Could not reach Supabase server. Make sure Docker containers are running."
        } else if (error.message.includes("auth/invalid_credentials")) {
          errorMessage = "Authentication error: Invalid API credentials. Check your .env.local file."
        } else if (error.message.includes("permission denied")) {
          errorMessage = "Permission error: Your account doesn't have access to required tables."
        } else {
          // Use the actual error message
          errorMessage = error.message
        }
      }
      
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const isUsingSupabase = settings.database.preferredProvider === 'supabase'

  // Function to manually sync settings
  const syncSettings = async () => {
    setIsLoading(true)
    try {
      const success = await settings.syncSettings()
      if (success) {
        toast({
          title: "Settings synced",
          description: "Your settings have been successfully synced with Supabase."
        })
      } else {
        toast({
          title: "Sync not needed",
          description: "Settings are already in sync or Supabase is not enabled."
        })
      }
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Failed to sync settings with Supabase.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Provider
        </CardTitle>
        <CardDescription>
          Choose between local storage (IndexedDB) or cloud storage (Supabase)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                <Label htmlFor="supabase-enabled">Use Supabase (Cloud Storage)</Label>
              </div>
              <div className="text-sm text-muted-foreground">
                Store your documents and results securely in the cloud
              </div>
            </div>
            <Switch
              id="supabase-enabled"
              checked={isUsingSupabase}
              onCheckedChange={handleProviderToggle}
              disabled={!isSupabaseAvailable || isLoading}
            />
          </div>

          {!isSupabaseAvailable && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Supabase not configured</AlertTitle>
              <AlertDescription>
                Supabase environment variables are missing. Please check your .env.local file.
              </AlertDescription>
            </Alert>
          )}

          {isSupabaseAvailable && !isUsingSupabase && (
            <div className="mt-4 flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={testConnection}
                disabled={isTestingConnection}
              >
                {isTestingConnection ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
              {connectionStatus === 'success' && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> Connection available
                </span>
              )}
              {connectionStatus === 'error' && (
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Connection failed
                </span>
              )}
            </div>
          )}

          {isSupabaseAvailable && isUsingSupabase && (
            <div 
              className={`mt-4 rounded-lg border p-4 transition-all duration-300 ${
                connectionStatus === 'success' 
                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                  : connectionStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                    : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-full p-1.5 ${
                  connectionStatus === 'success' 
                    ? 'bg-green-100 dark:bg-green-900' 
                    : connectionStatus === 'error'
                      ? 'bg-red-100 dark:bg-red-900'
                      : 'bg-amber-100 dark:bg-amber-900'
                }`}>
                  {connectionStatus === 'success' ? (
                    <Cloud className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : connectionStatus === 'error' ? (
                    <CloudOff className="h-4 w-4 text-red-600 dark:text-red-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">
                      Supabase Status
                    </h4>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      connectionStatus === 'success'
                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        : connectionStatus === 'error'
                          ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                          : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                    }`}>
                      {connectionStatus === 'success' 
                        ? 'Connected' 
                        : connectionStatus === 'error' 
                          ? 'Connection failed' 
                          : 'Not tested'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {connectionStatus === 'success'
                      ? "Your application is using Supabase cloud storage. Data will sync across devices."
                      : connectionStatus === 'error'
                        ? "Unable to connect to Supabase. Please check your configuration."
                        : "Please test your connection to Supabase to ensure data will sync properly."}
                  </p>
                  
                  <div className="mt-3 flex gap-2">
                    <Button 
                      variant={connectionStatus === 'success' ? "outline" : "default"} 
                      size="sm" 
                      onClick={testConnection}
                      disabled={isTestingConnection}
                      className="gap-2"
                    >
                      {isTestingConnection ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                          Testing...
                        </>
                      ) : (
                        connectionStatus === 'success' ? "Test Again" : "Test Connection"
                      )}
                    </Button>
                    
                    {connectionStatus === 'success' && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={syncSettings}
                        disabled={isLoading}
                        className="gap-2"
                      >
                        {isLoading ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                            Syncing...
                          </>
                        ) : (
                          "Sync Settings"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 