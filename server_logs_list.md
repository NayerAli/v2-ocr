# Server-side Log Usages

## middleware.ts
- **Line 10:** `console.log('Middleware: Processing request for URL:', req.nextUrl.pathname)`
- **Line 31:** `console.log('Middleware: Created Supabase client with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)`
- **Line 44:** `console.log('Middleware: Parsed cookies:', cookieNames)`
- **Line 58:** `console.log('Middleware: Found auth cookies:', authCookieNames)`
- **Line 66:** `console.error('Middleware: Error getting session:', error.message)`
- **Line 69:** `console.log('Middleware: Session found for user:', data.session.user.email)`
- **Line 71:** `console.log('Middleware: No session found from Supabase')`
- **Line 86:** `console.log('Middleware: Manually parsed auth token from cookie')`
- **Line 93:** `console.log('Middleware: Manually verified user from token:', userData.user.email)`
- **Line 98:** `console.error(`Middleware: Error parsing ${cookieName} cookie`)`
- **Line 105:** `console.error('Middleware: Exception getting session:', e)`
- **Line 123:** `console.log('Middleware: Route check -', { ... })`
- **Line 132:** `console.log('Middleware: Redirecting to login from protected route:', url)`
- **Line 144:** `console.log('Middleware: Redirecting to home from auth route:', url)`

## lib/user-settings-service.ts
- Multiple lines: Extensive use of `console.log`, `console.error`, and `console.warn` for debugging, error handling, and fallback logic. Examples:
  - `console.log('UserSettingsService: User ID set to', userId);`
  - `console.error('Error getting current user:', error);`
  - `console.log('[DEBUG] Using service client to fetch OCR settings');`
  - `console.warn('[DEBUG] Update returned empty array, may not have updated the database');`
  - ... (see file for full list, as this file is heavily instrumented)

## lib/server-logger.ts
- **Initialization:**
  - `console.log('Created log directory: ...')`
  - `console.error('Failed to create log directory:', error)`
  - `console.log('Created log file: ...')`
  - `console.error('Failed to create log file:', error)`
- **writeToLog function:**
  - `console.log('[LOG] Wrote entry to ...')` (development only)
  - `console.error('Failed to write to log file:', error)`
  - `console.log('Created log directory: ...')` (retry)
  - `console.log('Recreated log file and wrote entry: ...')` (retry)
  - `console.error('Failed to recreate log file:', retryError)`

## lib/server-console-logger.ts
- **logApiRequestToConsole:**
  - `console.log('[SERVER-API] ...')` (request details)
  - `console.log('[SERVER-API] ... Params:', params)`
- **logApiResponseToConsole:**
  - `console.log('[SERVER-API] ...')` (response details)
- **withConsoleApiLogging:**
  - `console.log('[SERVER-API] ...')` (request and response)
  - `console.error('[SERVER-API] ... ERROR in ...:', errorMessage)`

## lib/system-settings-service.ts
- **Error handling:**
  - `console.error('Error fetching processing settings:', error)`
  - `console.error('Exception fetching processing settings:', error)`
  - `console.error('Error updating processing settings:', error)`
  - `console.error('Exception updating processing settings:', error)`
  - `console.error('Error fetching OCR defaults:', error)`
  - `console.error('Exception fetching OCR defaults:', error)`

## lib/user-profile-service.ts
- **Error handling:**
  - `console.error('Error fetching user profile:', error)`
  - `console.error('Error in getProfile:', error)`
  - `console.error('Error creating default profile:', error)`
  - `console.error('Error updating user profile:', error)`
  - `console.error('Error in updateProfile:', error)`
  - `console.error('Error fetching user profile by ID:', error)`

---

**Note:**
- This list includes only server-side logs (Node.js, API, backend, middleware, and lib/server-logger usage).
- For client-side logs, see `client_logs_list.md`. 