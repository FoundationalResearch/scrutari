import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithRetry } from './retry.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function mockResponse(status: number, statusText: string, headers?: Headers): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: headers ?? new Headers(),
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}

describe('fetchWithRetry', () => {
  it('returns response on success', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, 'OK'));

    const response = await fetchWithRetry('https://example.com', {});
    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(429, 'Too Many Requests'))
      .mockResolvedValueOnce(mockResponse(200, 'OK'));

    const response = await fetchWithRetry('https://example.com', {}, {
      maxRetries: 2,
      initialDelayMs: 10,
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(mockResponse(200, 'OK'));

    const response = await fetchWithRetry('https://example.com', {}, {
      maxRetries: 2,
      initialDelayMs: 10,
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 502 and 503', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(502, 'Bad Gateway'))
      .mockResolvedValueOnce(mockResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(mockResponse(200, 'OK'));

    const response = await fetchWithRetry('https://example.com', {}, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 400', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(400, 'Bad Request'));

    await expect(
      fetchWithRetry('https://example.com', {}, { maxRetries: 2 }),
    ).rejects.toThrow('400');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(401, 'Unauthorized'));

    await expect(
      fetchWithRetry('https://example.com', {}, { maxRetries: 2 }),
    ).rejects.toThrow('401');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 404', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(404, 'Not Found'));

    await expect(
      fetchWithRetry('https://example.com', {}, { maxRetries: 2 }),
    ).rejects.toThrow('404');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries on persistent 429', async () => {
    mockFetch.mockResolvedValue(mockResponse(429, 'Too Many Requests'));

    await expect(
      fetchWithRetry('https://example.com', {}, {
        maxRetries: 2,
        initialDelayMs: 10,
      }),
    ).rejects.toThrow('429');

    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('respects Retry-After header', async () => {
    const headers = new Headers();
    headers.set('Retry-After', '1');
    mockFetch
      .mockResolvedValueOnce(mockResponse(429, 'Too Many Requests', headers))
      .mockResolvedValueOnce(mockResponse(200, 'OK'));

    const start = Date.now();
    await fetchWithRetry('https://example.com', {}, {
      maxRetries: 1,
      initialDelayMs: 10,
    });
    const elapsed = Date.now() - start;

    // Should have waited at least 1 second for Retry-After
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it('error message includes URL', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(403, 'Forbidden'));

    await expect(
      fetchWithRetry('https://api.example.com/data', {}),
    ).rejects.toThrow('https://api.example.com/data');
  });

  it('error message includes rate limited hint for 429', async () => {
    mockFetch.mockResolvedValue(mockResponse(429, 'Too Many Requests'));

    await expect(
      fetchWithRetry('https://example.com', {}, {
        maxRetries: 0,
      }),
    ).rejects.toThrow('rate limited');
  });

  it('retries on network errors', async () => {
    const networkError = new Error('fetch failed: ECONNRESET');
    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(mockResponse(200, 'OK'));

    const response = await fetchWithRetry('https://example.com', {}, {
      maxRetries: 1,
      initialDelayMs: 10,
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Invalid argument'));

    await expect(
      fetchWithRetry('https://example.com', {}, { maxRetries: 2 }),
    ).rejects.toThrow('Invalid argument');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry AbortError', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(
      fetchWithRetry('https://example.com', {}, { maxRetries: 2 }),
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
