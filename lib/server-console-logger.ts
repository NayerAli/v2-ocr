/**
 * Server-side console logging utility for API requests and responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverLog, serverError } from './log'

/**
 * Log API request details to console
 */
export function logApiRequestToConsole(
  // We need the request parameter for future use but don't use it currently
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: NextRequest,
  method: string,
  url: string,
  params?: Record<string, unknown>
) {
  const requestId = crypto.randomUUID().substring(0, 8)

  // Note: We're not logging headers to avoid exposing sensitive information

  serverLog(requestId, `${method} ${url}`)

  if (params && Object.keys(params).length > 0) {
    serverLog(requestId, `Params:`, params)
  }
}

/**
 * Log API response details to console
 */
export function logApiResponseToConsole(
  requestId: string,
  method: string,
  url: string,
  status: number,
  duration: number
) {
  serverLog(requestId, `${method} ${url} - ${status} in ${duration}ms`)
}

/**
 * Middleware for API routes to log requests and responses to console
 */
export function withConsoleApiLogging(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const method = req.method
    // We use pathname from nextUrl instead of the full URL
    const pathname = req.nextUrl.pathname

    // Generate a unique request ID
    const requestId = crypto.randomUUID().substring(0, 8)

    // Extract query parameters if needed in the future
    // const { searchParams } = new URL(url)
    // const params = Object.fromEntries(searchParams.entries())

    // Log the request
    serverLog(requestId, `${method} ${pathname}`)

    const startTime = Date.now()

    try {
      // Call the original handler
      const response = await handler(req)

      // Calculate duration
      const duration = Date.now() - startTime

      // Log the response
      serverLog(requestId, `${method} ${pathname} - ${response.status} in ${duration}ms`)

      return response
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Calculate duration
      const duration = Date.now() - startTime

      // Log error
      serverError(requestId, `${method} ${pathname} - ERROR in ${duration}ms:`, errorMessage)

      // Return a 500 error response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}
