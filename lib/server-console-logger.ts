/**
 * Server-side console logging utility for API requests and responses
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Log API request details to console
 */
export function logApiRequestToConsole(
  req: NextRequest,
  method: string,
  url: string,
  params?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString()
  const requestId = crypto.randomUUID().substring(0, 8)

  // Sanitize headers to remove sensitive information
  // We're not using headers in this function, but keeping the code for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const headers = Object.fromEntries(
    Array.from(req.headers.entries())
      .filter(([key]) => !['cookie', 'authorization'].includes(key.toLowerCase()))
  )

  console.log(`[SERVER-API] ${timestamp} [${requestId}] ${method} ${url}`)

  if (params && Object.keys(params).length > 0) {
    console.log(`[SERVER-API] ${timestamp} [${requestId}] Params:`, params)
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
  const timestamp = new Date().toISOString()
  console.log(`[SERVER-API] ${timestamp} [${requestId}] ${method} ${url} - ${status} in ${duration}ms`)
}

/**
 * Middleware for API routes to log requests and responses to console
 */
export function withConsoleApiLogging(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const method = req.method
    const url = req.url
    const pathname = req.nextUrl.pathname

    // Generate a unique request ID
    const requestId = crypto.randomUUID().substring(0, 8)

    // Extract query parameters
    const { searchParams } = new URL(url)
    // We're not using params in this function, but keeping the code for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const params = Object.fromEntries(searchParams.entries())

    // Get current timestamp
    const timestamp = new Date().toISOString()

    // Log the request
    console.log(`[SERVER-API] ${timestamp} [${requestId}] ${method} ${pathname}`)

    const startTime = Date.now()

    try {
      // Call the original handler
      const response = await handler(req)

      // Calculate duration
      const duration = Date.now() - startTime

      // Get current timestamp for response
      const responseTimestamp = new Date().toISOString()

      // Log the response
      console.log(`[SERVER-API] ${responseTimestamp} [${requestId}] ${method} ${pathname} - ${response.status} in ${duration}ms`)

      return response
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Calculate duration
      const duration = Date.now() - startTime

      // Get current timestamp for error
      const errorTimestamp = new Date().toISOString()

      // Log error
      console.error(`[SERVER-API] ${errorTimestamp} [${requestId}] ${method} ${pathname} - ERROR in ${duration}ms:`, errorMessage)

      // Return a 500 error response
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}
