'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export default function AuthErrorPage() {
  const router = useRouter()
  
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authentication Error</CardTitle>
          <CardDescription>
            There was a problem with your authentication request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            This could be due to an expired or invalid authentication link, or a problem with your account.
          </p>
          <p className="text-sm text-muted-foreground">
            Please try logging in again, or contact support if the problem persists.
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/')}>
            Go to Home
          </Button>
          <Button onClick={() => router.push('/auth/login')}>
            Go to Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
