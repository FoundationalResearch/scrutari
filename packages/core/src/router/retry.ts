/**
 * Retry utility with exponential backoff.
 *
 * Provides configurable retry logic for LLM calls and tool invocations.
 * Supports HTTP status-aware retries, timeouts, and error classification.
 */

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Classifies an error for retry decision-making. */
export type ErrorCategory =
  | 'rate_limit'       // 429 — backoff and retry
  | 'server_error'     // 500/502/503 — backoff and retry
  | 'timeout'          // Request timed out — retry with shorter/same timeout
  | 'budget_exceeded'  // Budget limit hit — do not retry
  | 'auth_error'       // 401/403 — do not retry
  | 'not_found'        // 404 — do not retry
  | 'json_parse'       // Invalid JSON response — limited retry
  | 'unknown';         // Unclassified error

export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof BudgetExceededRetryError) return 'budget_exceeded';

  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  // Check for HTTP status codes in error messages
  if (/\b429\b/.test(message) || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
    return 'rate_limit';
  }
  if (/\b(500|502|503)\b/.test(message) || lowerMsg.includes('internal server error') || lowerMsg.includes('bad gateway') || lowerMsg.includes('service unavailable')) {
    return 'server_error';
  }
  if (/\b(401|403)\b/.test(message) || lowerMsg.includes('unauthorized') || lowerMsg.includes('forbidden') || lowerMsg.includes('api key')) {
    return 'auth_error';
  }
  if (/\b404\b/.test(message) || lowerMsg.includes('not found')) {
    return 'not_found';
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('aborted')) {
    return 'timeout';
  }
  if (lowerMsg.includes('json') && (lowerMsg.includes('parse') || lowerMsg.includes('unexpected token'))) {
    return 'json_parse';
  }
  if (error instanceof Error && error.name === 'BudgetExceededError') {
    return 'budget_exceeded';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000). */
  initialDelayMs?: number;
  /** Backoff multiplier (default: 2). */
  backoffMultiplier?: number;
  /** Maximum delay cap in milliseconds (default: 30000). */
  maxDelayMs?: number;
  /** Timeout per attempt in milliseconds (default: 30000). */
  timeoutMs?: number;
  /** Error categories that should be retried. */
  retryOn?: ErrorCategory[];
  /** Abort signal for cancellation. */
  abortSignal?: AbortSignal;
  /** Called before each retry with attempt info. */
  onRetry?: (attempt: number, error: Error, category: ErrorCategory, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'abortSignal' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  timeoutMs: 30000,
  retryOn: ['rate_limit', 'server_error', 'timeout'],
};

// ---------------------------------------------------------------------------
// Retry result
// ---------------------------------------------------------------------------

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalDelayMs: number;
}

// ---------------------------------------------------------------------------
// Core retry function
// ---------------------------------------------------------------------------

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result with retry metadata
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  config: RetryConfig = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
    initialDelayMs = DEFAULT_RETRY_CONFIG.initialDelayMs,
    backoffMultiplier = DEFAULT_RETRY_CONFIG.backoffMultiplier,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    timeoutMs = DEFAULT_RETRY_CONFIG.timeoutMs,
    retryOn = DEFAULT_RETRY_CONFIG.retryOn,
    abortSignal,
    onRetry,
  } = config;

  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check abort signal before each attempt
    if (abortSignal?.aborted) {
      throw new AbortError('Operation aborted');
    }

    try {
      const result = await withTimeout(fn(attempt), timeoutMs, abortSignal);
      return { result, attempts: attempt + 1, totalDelayMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const category = classifyError(err);

      // Don't retry non-retryable errors
      if (!retryOn.includes(category)) {
        throw lastError;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      const jitter = baseDelay * 0.1 * Math.random();
      const delay = Math.min(baseDelay + jitter, maxDelayMs);

      // Check for Retry-After header hint in error message
      const retryAfter = extractRetryAfter(lastError.message);
      const actualDelay = retryAfter ? Math.max(delay, retryAfter * 1000) : delay;

      onRetry?.(attempt + 1, lastError, category, actualDelay);

      // Wait before retrying
      await sleep(actualDelay, abortSignal);
      totalDelayMs += actualDelay;
    }
  }

  throw lastError ?? new Error('Retry failed with no error captured');
}

// ---------------------------------------------------------------------------
// Preset configurations for common scenarios
// ---------------------------------------------------------------------------

/** Retry config for LLM calls on rate limit (429). */
export const LLM_RATE_LIMIT_RETRY: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  retryOn: ['rate_limit', 'server_error', 'timeout'],
};

/** Retry config for LLM calls on server errors (5xx). */
export const LLM_SERVER_ERROR_RETRY: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 2000,
  backoffMultiplier: 2,
  retryOn: ['rate_limit', 'server_error', 'timeout'],
};

/** Retry config for tool API calls. */
export const TOOL_RETRY: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
  retryOn: ['rate_limit', 'server_error', 'timeout'],
};

/** Retry config for MCP tool calls. */
export const MCP_TOOL_RETRY: RetryConfig = {
  maxRetries: 1,
  initialDelayMs: 1000,
  timeoutMs: 30000,
  retryOn: ['timeout', 'server_error'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a promise with a timeout. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<T> {
  if (timeoutMs <= 0 || timeoutMs === Infinity) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Listen for abort
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError('Operation aborted'));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        clearTimeout(timer);
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        abortSignal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Sleep for the given milliseconds, respecting abort signal. */
export function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new AbortError('Operation aborted'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError('Operation aborted during retry delay'));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Extract Retry-After header value from error message (seconds). */
function extractRetryAfter(message: string): number | undefined {
  const match = message.match(/retry.?after[:\s]+(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

/** Sentinel error to prevent retries on budget exceeded. */
export class BudgetExceededRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededRetryError';
  }
}
