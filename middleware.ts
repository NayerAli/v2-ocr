import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { middlewareLog } from '@/lib/log'

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  // Always log the request URL in all environments
  middlewareLog('debug', 'Middleware: Processing request for URL:', request.nextUrl.pathname)

  // Use the updateSession function from our middleware utility
  return await updateSession(request)
}

// Specify which routes this middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
