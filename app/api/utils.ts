import { NextRequest, NextResponse } from 'next/server'
import { withConsoleApiLogging } from '@/lib/server-console-logger'

/**
 * Wrapper for API routes to add logging and error handling
 */
export function createApiHandler(handler: (req: NextRequest) => Promise<NextResponse>) {
  // Apply console logging middleware
  return withConsoleApiLogging(async (req: NextRequest) => {
    try {
      // Call the original handler
      return await handler(req)
    } catch (error: any) {
      // Log the error
      console.error(`API Error: ${error.message || 'Unknown error'}`)
      
      // Return a 500 error response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  })
}
