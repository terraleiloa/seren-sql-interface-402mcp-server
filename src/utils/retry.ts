// ABOUTME: Retry utility for handling transient errors like timeouts and connection issues

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Check if an error is retryable (timeout, connection error, or 5xx errors)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Check for timeout/abort errors
    if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('Connection terminated')) {
      return true;
    }
    
    // Check for connection errors
    if (error.message.includes('ECONNRESET') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED')) {
      return true;
    }
    
    // Check for 5xx HTTP errors (retryable server errors)
    const errorAny = error as any;
    if (errorAny.statusCode && errorAny.statusCode >= 500 && errorAny.statusCode < 600) {
      // Check error details for connection timeout
      if (errorAny.errorBody?.details?.includes('timeout') || 
          errorAny.errorBody?.details?.includes('Connection terminated')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delayMs, shouldRetry = isRetryableError, onRetry } = options;
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < maxAttempts && shouldRetry(error, attempt)) {
        if (onRetry) {
          onRetry(error, attempt);
        }
        
        // Exponential backoff: delayMs * 2^(attempt - 1)
        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
      
      // Don't retry - throw the error
      throw error;
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError;
}








