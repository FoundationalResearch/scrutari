import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  withRetry,
  withTimeout,
  sleep,
  TimeoutError,
  AbortError,
  BudgetExceededRetryError,
} from './retry.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe('classifyError', () => {
  it('classifies 429 as rate_limit', () => {
    expect(classifyError(new Error('HTTP 429 Too Many Requests'))).toBe('rate_limit');
  });

  it('classifies rate limit text as rate_limit', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
  });

  it('classifies "too many requests" as rate_limit', () => {
    expect(classifyError(new Error('too many requests'))).toBe('rate_limit');
  });

  it('classifies 500 as server_error', () => {
    expect(classifyError(new Error('500 Internal Server Error'))).toBe('server_error');
  });

  it('classifies 502 as server_error', () => {
    expect(classifyError(new Error('502 Bad Gateway'))).toBe('server_error');
  });

  it('classifies 503 as server_error', () => {
    expect(classifyError(new Error('503 Service Unavailable'))).toBe('server_error');
  });

  it('classifies 401 as auth_error', () => {
    expect(classifyError(new Error('401 Unauthorized'))).toBe('auth_error');
  });

  it('classifies 403 as auth_error', () => {
    expect(classifyError(new Error('403 Forbidden'))).toBe('auth_error');
  });

  it('classifies "api key" as auth_error', () => {
    expect(classifyError(new Error('Invalid API key'))).toBe('auth_error');
  });

  it('classifies 404 as not_found', () => {
    expect(classifyError(new Error('404 Not Found'))).toBe('not_found');
  });

  it('classifies timeout as timeout', () => {
    expect(classifyError(new Error('Request timed out'))).toBe('timeout');
  });

  it('classifies aborted as timeout', () => {
    expect(classifyError(new Error('Request aborted'))).toBe('timeout');
  });

  it('classifies JSON parse error as json_parse', () => {
    expect(classifyError(new Error('JSON parse error: unexpected token'))).toBe('json_parse');
  });

  it('classifies BudgetExceededRetryError as budget_exceeded', () => {
    expect(classifyError(new BudgetExceededRetryError('over budget'))).toBe('budget_exceeded');
  });

  it('classifies named BudgetExceededError as budget_exceeded', () => {
    const err = new Error('Budget hit');
    err.name = 'BudgetExceededError';
    expect(classifyError(err)).toBe('budget_exceeded');
  });

  it('classifies unknown errors as unknown', () => {
    expect(classifyError(new Error('Something weird happened'))).toBe('unknown');
  });

  it('handles non-Error objects', () => {
    expect(classifyError('string error')).toBe('unknown');
    expect(classifyError(42)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const { result, attempts } = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue('recovered');

    const { result, attempts } = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      retryOn: ['server_error'],
    });

    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        retryOn: ['rate_limit', 'server_error'],
      }),
    ).rejects.toThrow('401 Unauthorized');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('429 rate limited'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        retryOn: ['rate_limit'],
      }),
    ).rejects.toThrow('429 rate limited');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry BudgetExceededRetryError', async () => {
    const fn = vi.fn().mockRejectedValue(
      new BudgetExceededRetryError('Budget exceeded'),
    );

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        retryOn: ['rate_limit', 'server_error'],
      }),
    ).rejects.toThrow('Budget exceeded');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockResolvedValue('ok');

    await expect(
      withRetry(fn, { abortSignal: controller.signal }),
    ).rejects.toThrow('aborted');

    expect(fn).not.toHaveBeenCalled();
  });

  it('calls onRetry callback before each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('500 error'))
      .mockResolvedValue('ok');

    await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      retryOn: ['server_error'],
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 'server_error', expect.any(Number));
  });

  it('passes attempt number to fn', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('500 error'))
      .mockResolvedValue('ok');

    await withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
      retryOn: ['server_error'],
    });

    expect(fn).toHaveBeenCalledWith(0);
    expect(fn).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  it('resolves if promise completes before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('done'),
      5000,
    );
    expect(result).toBe('done');
  });

  it('rejects with TimeoutError if promise exceeds timeout', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 5000));

    await expect(withTimeout(slow, 10)).rejects.toThrow(TimeoutError);
  });

  it('passes through non-timeout rejection', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('fail')), 5000),
    ).rejects.toThrow('fail');
  });

  it('skips timeout if timeoutMs is 0', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 0);
    expect(result).toBe('ok');
  });

  it('skips timeout if timeoutMs is Infinity', async () => {
    const result = await withTimeout(Promise.resolve('ok'), Infinity);
    expect(result).toBe('ok');
  });

  it('rejects with AbortError when signal is aborted', async () => {
    const controller = new AbortController();
    const slow = new Promise(resolve => setTimeout(resolve, 5000));

    const promise = withTimeout(slow, 10000, controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrow(AbortError);
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

describe('sleep', () => {
  it('resolves after specified time', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it('rejects immediately if already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(1000, controller.signal)).rejects.toThrow();
  });

  it('rejects when signal is aborted during sleep', async () => {
    const controller = new AbortController();
    const promise = sleep(5000, controller.signal);
    setTimeout(() => controller.abort(), 10);

    await expect(promise).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('error classes', () => {
  it('TimeoutError has correct name', () => {
    const err = new TimeoutError('timed out');
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toBe('timed out');
    expect(err instanceof Error).toBe(true);
  });

  it('AbortError has correct name', () => {
    const err = new AbortError('aborted');
    expect(err.name).toBe('AbortError');
    expect(err instanceof Error).toBe(true);
  });

  it('BudgetExceededRetryError has correct name', () => {
    const err = new BudgetExceededRetryError('over budget');
    expect(err.name).toBe('BudgetExceededRetryError');
    expect(err instanceof Error).toBe(true);
  });
});
