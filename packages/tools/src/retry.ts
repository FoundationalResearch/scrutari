/**
 * Lightweight HTTP fetch retry utility for tool clients.
 *
 * Retries on 429 (rate limit) and 5xx (server errors) with exponential backoff.
 * Respects Retry-After headers. Supports abort signals.
 */

export interface FetchRetryConfig {
  /** Maximum retry attempts (default: 2). */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000). */
  initialDelayMs?: number;
  /** Backoff multiplier (default: 2). */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms (default: 15000). */
  maxDelayMs?: number;
}

const DEFAULT_CONFIG: Required<FetchRetryConfig> = {
  maxRetries: 2,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 15000,
};

/**
 * Fetch with automatic retry on rate limits and server errors.
 * Returns the successful Response or throws after all retries exhausted.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  config: FetchRetryConfig = {},
): Promise<Response> {
  const {
    maxRetries = DEFAULT_CONFIG.maxRetries,
    initialDelayMs = DEFAULT_CONFIG.initialDelayMs,
    backoffMultiplier = DEFAULT_CONFIG.backoffMultiplier,
    maxDelayMs = DEFAULT_CONFIG.maxDelayMs,
  } = config;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Don't retry on success or client errors (except 429)
      if (response.ok) {
        return response;
      }

      const status = response.status;
      const isRetryable = status === 429 || (status >= 500 && status <= 599);

      if (!isRetryable || attempt >= maxRetries) {
        throw new Error(
          `HTTP ${status} ${response.statusText}` +
          (status === 429 ? ' (rate limited)' : '') +
          ` for ${url}`,
        );
      }

      // Calculate delay
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      const jitter = baseDelay * 0.1 * Math.random();
      let delay = Math.min(baseDelay + jitter, maxDelayMs);

      // Respect Retry-After header if available
      const retryAfter = response.headers?.get?.('Retry-After');
      if (retryAfter) {
        const retryAfterSecs = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterSecs)) {
          delay = Math.max(delay, retryAfterSecs * 1000);
        }
      }

      lastError = new Error(`HTTP ${status} ${response.statusText} for ${url}`);

      // Wait before retry, respecting abort signal
      await sleep(delay, init.signal as AbortSignal | undefined);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      // Retry on network/timeout errors
      const isNetworkError = lastError.message.includes('fetch failed') ||
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('ETIMEDOUT') ||
        lastError.message.includes('timeout');

      if (!isNetworkError || attempt >= maxRetries) {
        throw lastError;
      }

      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      const jitter = baseDelay * 0.1 * Math.random();
      const delay = Math.min(baseDelay + jitter, maxDelayMs);
      await sleep(delay, init.signal as AbortSignal | undefined);
    }
  }

  throw lastError ?? new Error('Fetch retry failed');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
