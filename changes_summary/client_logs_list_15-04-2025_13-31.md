# Client-side Log Usages

## app/page.tsx
- **Line 62:** `console.log('[DEBUG] Creating processing service with settings:');`
- **Line 63:** `console.log('[DEBUG] OCR settings:', settings.ocr);`
- **Line 64:** `console.log('[DEBUG] Processing settings:', settings.processing);`
- **Line 65:** `console.log('[DEBUG] Upload settings:', settings.upload);`
- **Line 90:** `console.log('[DEBUG] loadQueue called, isInitialLoad:', isInitialLoad);`
- **Line 91:** `console.log('[DEBUG] isInitialized:', isInitialized);`
- **Line 92:** `console.log('[DEBUG] isAuthenticated:', !!user);`
- **Line 97:** `console.log('[DEBUG] Not initialized, skipping queue load');`
- **Line 105:** `console.log('[DEBUG] User not authenticated, skipping queue load');`
- **Line 114:** `console.log('[DEBUG] Initial load, setting loading state');`
- **Line 121:** `console.log('[DEBUG] Loading queue from database');`
- **Line 125:** `console.log('[DEBUG] Queue loaded, items:', queue.length);`
- **Line 130:** `console.log('[DEBUG] Component unmounted, aborting update');`
- **Line 136:** `console.log('[DEBUG] Updating processing queue state');`
- **Line 158:** `console.error('Error loading queue:', error)`
- **Line 180:** `console.log('[DEBUG] handleFilesAccepted called with', files.length, 'files');`
- **Line 184:** `console.log('[DEBUG] Calling processingService.addToQueue');`
- **Line 188:** `console.log('[DEBUG] processingService.addToQueue returned IDs:', ids);`
- **Line 192:** `console.log('[DEBUG] Getting status for each file');`
- **Line 196:** `console.log('[DEBUG] Got status for files:', newItems.length);`
- **Line 201:** `console.log('[DEBUG] Valid items:', validItems.length);`
- **Line 206:** `console.log('[DEBUG] Previous queue length:', prev.length);`
- **Line 210:** `console.log('[DEBUG] New queue length:', newQueue.length);`
- **Line 220:** `console.log('[DEBUG] Showing toast notification');`
- **Line 227:** `console.error('[DEBUG] Error in handleFilesAccepted:', error);`

## app/settings/page.tsx
- **Line 106:** `console.log('[DEBUG] Settings changed, marking as unsaved');`
- **Line 137:** `console.log('[DEBUG] Manually saving settings to database');`
- **Line 182:** `console.error('[DEBUG] Error saving settings:', error)`

## app/documents/[id]/page.tsx
- **Line 286:** `console.error('Document loading error:', err)`
- **Line 360:** `console.error('Failed to preload image for page ${idx + 1}:', error)`
- **Line 434:** `console.error('Copy error:', err)`
- **Line 504:** `console.error('Download error:', err)`

## app/documents/page.tsx
- **Line 49:** `console.log('Documents page: Initialized, loading documents for user')`
- **Line 53:** `console.log('Documents page: Documents loaded:', queue.length)`
- **Line 57:** `console.error('Error loading documents:', error)`
- **Line 75:** `console.error('Error loading documents:', error)`
- **Line 122:** `console.log('[DEBUG] Deleting document:', id);`
- **Line 129:** `console.log('[DEBUG] Canceling processing before delete');`
- **Line 138:** `console.error('[DEBUG] Failed to cancel processing:', await cancelResponse.text());`
- **Line 151:** `console.error('[DEBUG] Failed to delete document:', await deleteResponse.text());`
- **Line 157:** `console.log('[DEBUG] Document deleted successfully');`
- **Line 159:** `console.error('[DEBUG] Error deleting document:', error);`
- **Line 165:** `console.log('[DEBUG] Canceling processing for document:', id);`
- **Line 175:** `console.error('[DEBUG] Failed to cancel processing:', await cancelResponse.text());`
- **Line 184:** `console.log('[DEBUG] Processing canceled successfully');`
- **Line 186:** `console.error('[DEBUG] Error canceling processing:', error);`

## app/components/auth/auth-provider.tsx
- Multiple lines: Extensive use of `console.log` and `console.error` for auth state, session, and error handling. Examples:
  - `console.error('Auth Provider: Error getting session:', error.message)`
  - `console.log('Auth Provider: User authenticated:', data.session.user.email)`
  - `console.log('Auth Provider: Session expires at:', new Date(data.session.expires_at! * 1000).toLocaleString())`
  - ... (see file for full list)

## app/components/auth/user-button.tsx
- **Line 50:** `console.error('Error signing out:', error)`

## app/components/auth/signup-form.tsx
- **Line 37:** `console.error('Signup form error:', err)`

## app/components/auth/login-form.tsx
- **Line 34:** `console.log('Login Form: Attempting to sign in with redirect to:', redirectTo || '/')`
- **Line 37:** `console.error('Login Form: Sign in error:', err)`

## app/components/auth/auth-check.tsx
- Multiple lines: `console.log` and `console.error` for session and auth state. Examples:
  - `console.error('[DEBUG] AuthCheck: Error getting session:', error.message)`
  - `console.log('AuthCheck: Auth token found in localStorage')`
  - ... (see file for full list)

## app/auth-test/page.tsx
- **Line 68:** `console.error('Error checking server auth:', err)`
- **Line 100:** `console.error('Error checking client auth:', err)`

## app/auth-status/page.tsx
- **Line 36:** `console.error('Error checking client auth:', err)`
- **Line 86:** `console.error('Error refreshing session:', err)`

---

**Note:**
- This list includes only client-side logs (React components, app/pages, and browser-side code).
- For server-side logs, see `server_logs_list.md`. 