/**
 * Server-side logging utility for API requests and responses
 */

import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { debugLog, prodError } from './log'

// Configure log directory and file
const LOG_DIR = process.env.LOG_DIR || 'logs'
const API_LOG_FILE = 'api-requests.log'

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    debugLog(`Created log directory: ${LOG_DIR}`)
  }
} catch (error) {
  prodError('Failed to create log directory:', error)
}

// Create an empty log file if it doesn't exist
try {
  const logPath = path.join(LOG_DIR, API_LOG_FILE)
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, `Log file created at ${new Date().toISOString()}\n`)
    debugLog(`Created log file: ${logPath}`)
  }
} catch (error) {
  prodError('Failed to create log file:', error)
}

/**
 * Log API request details to file
 */
export function logApiRequest(
  req: NextRequest,
  method: string,
  url: string,
  params?: Record<string, unknown>,
  body?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString()
  const requestId = crypto.randomUUID()

  const logEntry = {
    timestamp,
    requestId,
    method,
    url,
    params: sanitizeData(params),
    body: sanitizeData(body),
    headers: sanitizeHeaders(Object.fromEntries(req.headers.entries()))
  }

  writeToLog(`[REQUEST] ${JSON.stringify(logEntry)}`)

  return requestId
}

/**
 * Log API response details to file
 */
export function logApiResponse(
  requestId: string,
  status: number,
  data?: Record<string, unknown>,
  error?: { message?: string; code?: string; details?: unknown }
) {
  const timestamp = new Date().toISOString()

  const logEntry = {
    timestamp,
    requestId,
    status,
    data: sanitizeData(data),
    error: error ? {
      message: error.message,
      code: error.code,
      details: error.details
    } : null
  }

  writeToLog(`[RESPONSE] ${JSON.stringify(logEntry)}`)
}

/**
 * Write log entry to file
 */
function writeToLog(entry: string) {
  try {
    const logPath = path.join(LOG_DIR, API_LOG_FILE)
    fs.appendFileSync(logPath, `${entry}\n`)

    // Log to console that we wrote to the file (only in development)
    debugLog(`[LOG] Wrote entry to ${logPath}`)
  } catch (error) {
    prodError('Failed to write to log file:', error)

    // Try to create the directory and file again if they don't exist
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true })
        debugLog(`Created log directory: ${LOG_DIR}`)
      }

      const logPath = path.join(LOG_DIR, API_LOG_FILE)
      fs.appendFileSync(logPath, `Log file recreated at ${new Date().toISOString()}\n${entry}\n`)
      debugLog(`Recreated log file and wrote entry: ${logPath}`)
    } catch (retryError) {
      prodError('Failed to recreate log file:', retryError)
    }
  }
}

/**
 * Sanitize sensitive data from logs
 */
function sanitizeData(data: unknown): unknown {
  if (!data) return data

  // Clone the data to avoid modifying the original
  const sanitized = JSON.parse(JSON.stringify(data))

  // List of sensitive fields to redact
  const sensitiveFields = [
    'password',
    'apiKey',
    'api_key',
    'token',
    'secret',
    'authorization',
    'access_token',
    'refresh_token'
  ]

  // Recursively sanitize objects
  function sanitizeObject(obj: Record<string, unknown>) {
    if (!obj || typeof obj !== 'object') return

    Object.keys(obj).forEach(key => {
      const lowerKey = key.toLowerCase()

      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        obj[key] = '[REDACTED]'
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key] as Record<string, unknown>)
      }
    })
  }

  sanitizeObject(sanitized)
  return sanitized
}

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers }

  // List of sensitive headers to redact
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key'
  ]

  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase()
    if (sensitiveHeaders.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]'
    }
  })

  return sanitized
}

/**
 * Create a middleware wrapper for API routes to log requests and responses
 */
export function withApiLogging(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const method = req.method
    const url = req.url
    let body = null

    try {
      // Clone the request to read the body without consuming it
      const reqClone = req.clone()
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const contentType = req.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          body = await reqClone.json()
        }
      }
    } catch {
      // Ignore body parsing errors
    }

    // Extract query parameters
    const { searchParams } = new URL(url)
    const params = Object.fromEntries(searchParams.entries())

    // Log the request
    const requestId = logApiRequest(req, method, url, params, body)

    try {
      // Call the original handler
      const response = await handler(req)

      // Log the response
      let responseData = null
      try {
        // Clone the response to read the body without consuming it
        const resClone = response.clone()
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          responseData = await resClone.json()
        }
      } catch {
        // Ignore response parsing errors
      }

      logApiResponse(requestId, response.status, responseData)
      return response
    } catch (error: unknown) {
      const errorObj = error instanceof Error ? error : { message: 'Unknown error' }
      // Log error responses
      logApiResponse(requestId, 500, undefined, errorObj)
      throw error
    }
  }
}

/**
 * Log general server-side messages
 */
export function logServerMessage(category: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString()

  const logEntry = {
    timestamp,
    category,
    message,
    data: sanitizeData(data)
  }

  writeToLog(`[SERVER] ${JSON.stringify(logEntry)}`)
}
