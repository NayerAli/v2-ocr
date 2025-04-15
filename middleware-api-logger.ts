import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logApiRequest, logApiResponse, logServerMessage } from './lib/server-logger'

/**
 * API logging middleware
 * This middleware logs all API requests and responses
 */
export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const method = request.method
  const url = request.url
  const pathname = request.nextUrl.pathname
  
  // Generate a unique request ID
  const requestId = crypto.randomUUID()
  
  // Extract query parameters
  const { searchParams } = new URL(url)
  const params = Object.fromEntries(searchParams.entries())
  
  // Log the request (without body for now - we'll add that in the API handlers)
  logServerMessage('API', `${method} ${pathname}`, { 
    requestId, 
    params,
    headers: Object.fromEntries(
      Array.from(request.headers.entries())
        .filter(([key]) => !['cookie', 'authorization'].includes(key.toLowerCase()))
    )
  })
  
  // Continue to the API route
  return NextResponse.next()
}

// Configure the middleware to run only for API routes
export const config = {
  matcher: '/api/:path*',
}
