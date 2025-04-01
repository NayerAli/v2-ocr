/**
 * Retry configuration options
 */
interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelay?: number;
  /** Factor by which to increase delay with each retry (default: 2) */
  backoffFactor?: number;
  /** Whether to add jitter to delay to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable (defaults to always retry) */
  retryableError?: (error: unknown) => boolean;
  /** Callback function to execute on each retry attempt */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Returns a promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Adds random jitter to the delay time to prevent thundering herd
 */
function addJitter(delay: number): number {
  // Add +/- 20% jitter
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.floor(delay * jitterFactor);
}

/**
 * Executes a function with exponential backoff retry logic
 * 
 * @param fn - Async function to execute and potentially retry
 * @param options - Configuration options for retry behavior
 * @returns A promise that resolves with the return value of the function or rejects after all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    jitter = true,
    retryableError = () => true,
    onRetry = () => {}
  } = options;

  let attempts = 0;
  let delay = initialDelay;
  let lastError: unknown;

  while (attempts <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempts++;

      // If we've exhausted all retries or the error isn't retryable, throw
      if (attempts > maxRetries || !retryableError(error)) {
        throw error;
      }

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffFactor, maxDelay);
      
      // Add jitter if enabled
      const actualDelay = jitter ? addJitter(delay) : delay;
      
      // Call the onRetry callback
      onRetry(error, attempts, actualDelay);
      
      // Wait before the next retry
      await sleep(actualDelay);
    }
  }

  // This should never happen due to the throw in the catch block,
  // but TypeScript requires a return value
  throw lastError;
}

/**
 * Checks if an error is related to network connectivity issues
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMsg = error.message.toLowerCase();
    return (
      errorMsg.includes('network') ||
      errorMsg.includes('offline') ||
      errorMsg.includes('internet') ||
      errorMsg.includes('connection') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('failed to fetch') ||
      errorMsg.includes('socket') ||
      errorMsg.includes('cors') ||
      errorMsg.includes('http')
    );
  }
  return false;
}

/**
 * Defaults for common retry scenarios
 */
export const retryDefaults = {
  // Network operations (API calls, etc.)
  network: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    jitter: true,
    retryableError: isNetworkError
  },
  
  // Background syncing operations (can be more aggressive)
  backgroundSync: {
    maxRetries: 5,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffFactor: 2,
    jitter: true
  },
  
  // Critical operations (more retries, longer timeouts)
  critical: {
    maxRetries: 7,
    initialDelay: 1000,
    maxDelay: 120000,
    backoffFactor: 3,
    jitter: true
  }
}; 