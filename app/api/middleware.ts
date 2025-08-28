import { NextRequest, NextResponse } from 'next/server'
import { getUUID } from '@/lib/uuid'
import { logServerMessage } from '@/lib/server-logger'

/**
 * Middleware for API routes to log requests and responses
 */
export function withApiLogging(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const method = req.method
    const url = req.url
    const pathname = req.nextUrl.pathname

    // Generate a unique request ID
    const requestId = getUUID()

    // Extract query parameters
    const { searchParams } = new URL(url)
    const params = Object.fromEntries(searchParams.entries())

    // Log the request (without sensitive data)
    logServerMessage('API', `${method} ${pathname}`, {
      requestId,
      params,
      headers: Object.fromEntries(
        Array.from(req.headers.entries())
          .filter(([key]) => !['cookie', 'authorization'].includes(key.toLowerCase()))
      )
    })

    try {
      // Call the original handler
      const response = await handler(req)

      // Log the response status
      logServerMessage('API', `${method} ${pathname} - ${response.status}`, {
        requestId,
        status: response.status
      })

      return response
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Log error responses
      logServerMessage('API', `${method} ${pathname} - ERROR`, {
        requestId,
        error: errorMessage
      })

      // Return a 500 error response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}
