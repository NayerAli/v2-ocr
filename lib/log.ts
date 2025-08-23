/**
 * Centralized logging utility for the application
 *
 * This file provides a set of logging functions that are environment-aware
 * and help reduce console noise in production environments.
 *
 * Usage:
 * - debugLog: For development-only debugging logs (not shown in production)
 * - debugError: For development and test errors (not shown in production)
 * - infoLog: For informational messages (not shown in production)
 * - warnLog: For warnings (not shown in production)
 * - prodLog: For critical logs that must always be shown (e.g., fatal errors)
 * - serverLog: For server-side logs with timestamps and request IDs
 * - serverError: For server-side error logs with timestamps and request IDs
 */

// Determine if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

// List of allowed log patterns in production
const ALLOWED_PRODUCTION_LOGS = [
  'Middleware: Processing request for URL:',
  'Middleware: Route check -'
];

/**
 * Check if a log message should be shown in production
 */
function shouldShowInProduction(message: string): boolean {
  if (!isProduction) return true;

  return ALLOWED_PRODUCTION_LOGS.some(pattern =>
    typeof message === 'string' && message.startsWith(pattern)
  );
}

// Basic logging wrappers without deduplication

/**
 * Log debug messages (development only)
 * Use for verbose debugging information that should not appear in production
 */
export function debugLog(...args: unknown[]) {
  if (process.env.NODE_ENV === 'development') console.log(...args)
}

/**
 * Log debug errors (development and test only)
 * Use for non-critical errors that are useful for debugging but not needed in production
 */
export function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') console.error(...args)
}

/**
 * Log informational messages (development and test only)
 * Use for general information that's helpful during development
 */
export function infoLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') console.info(...args)
}

/**
 * Log warnings (development and test only)
 * Use for potential issues that don't break functionality but should be addressed
 */
export function warnLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

/**
 * Log critical messages (all environments)
 * Use for essential information that must be logged in all environments
 */
export function prodLog(...args: unknown[]) {
  console.log(...args)
}

/**
 * Log critical errors (all environments)
 * Use for critical errors that must be logged in all environments
 */
export function prodError(...args: unknown[]) {
  console.error(...args)
}

/**
 * Log server-side messages with timestamp and request ID
 * Use for server-side logging with consistent formatting
 */
export function serverLog(requestId: string | undefined, message: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString()
  const reqIdStr = requestId ? `[${requestId}]` : ''
  console.log(`[SERVER] ${timestamp} ${reqIdStr} ${message}`, ...args)
}

/**
 * Log middleware messages - only important ones in production
 * @param type 'important' for logs that should show in production, 'debug' for dev-only logs
 */
export function middlewareLog(type: 'important' | 'debug', message: string, ...args: unknown[]) {
  // In development, show all logs
  // In production, only show logs that match the allowed patterns
  if (!isProduction || (type === 'important' && shouldShowInProduction(message))) {
    console.log(message, ...args)
  }
}

/**
 * Log server-side errors with timestamp and request ID
 * Use for server-side error logging with consistent formatting
 */
export function serverError(requestId: string | undefined, message: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString()
  const reqIdStr = requestId ? `[${requestId}]` : ''
  console.error(`[SERVER-ERROR] ${timestamp} ${reqIdStr} ${message}`, ...args)
}

/**
 * Determine if a log should be shown based on frequency
 * Use to reduce log frequency for high-volume logs
 *
 * @param frequency Number between 0 and 1 representing the probability of logging
 * @returns Boolean indicating whether to log
 */
export function shouldLog(frequency = 0.05): boolean {
  return process.env.NODE_ENV === 'development' && Math.random() < frequency
}
