"use client"

import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { isSupabaseConfigured } from "@/lib/supabase-client"

export function SupabaseError() {
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    // Only check on the client side
    if (typeof window !== 'undefined') {
      setShowError(!isSupabaseConfigured())
    }
  }, [])

  if (!showError) return null

  const openSetupInstructions = () => {
    // Using optional chaining for type safety
    window?.open?.('https://github.com/NayerAli/v2-ocr#supabase-setup', '_blank', 'noopener,noreferrer')
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Supabase Configuration Error</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-2">
          Supabase credentials are missing or invalid. The application will not function correctly without proper database configuration.
        </p>
        <p className="mb-4">
          Please make sure you have set up your <code>.env.local</code> file with the following variables:
        </p>
        <pre className="bg-muted p-2 rounded text-sm mb-4">
          NEXT_PUBLIC_SUPABASE_URL=your_supabase_url<br />
          NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
        </pre>
        <Button
          variant="outline"
          onClick={openSetupInstructions}
        >
          View Setup Instructions
        </Button>
      </AlertDescription>
    </Alert>
  )
}
