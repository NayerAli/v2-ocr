import { NextRequest, NextResponse } from 'next/server'
import { withConsoleApiLogging } from '@/lib/server-console-logger'
import { serverError } from '@/lib/log'

/**
 * Wrapper for API routes to add logging and error handling
 */
export function createApiHandler(handler: (req: NextRequest) => Promise<NextResponse>) {
  // Apply console logging middleware
  return withConsoleApiLogging(async (req: NextRequest) => {
    try {
      // Call the original handler
      return await handler(req)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Log the error
      serverError(undefined, `API Error: ${errorMessage}`)

      // Return a 500 error response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  })
}
