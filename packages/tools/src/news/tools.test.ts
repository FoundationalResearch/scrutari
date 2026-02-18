import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchNewsTool } from './tools.js';
import type { ToolContext } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const contextWithKey: ToolContext = {
  config: { newsApiKey: 'test-brave-api-key' },
};

const contextNoKey: ToolContext = {
  config: {},
};

describe('searchNewsTool', () => {
  const braveSearchResponse = {
    results: [
      {
        title: 'Apple Reports Q4 Earnings Beat',
        description: 'Apple Inc. reported quarterly earnings that exceeded analyst expectations.',
        url: 'https://example.com/apple-earnings',
        meta_url: { hostname: 'example.com' },
        age: '2 hours ago',
      },
      {
        title: 'Tech Stocks Rally on AI Optimism',
        description: 'Major tech stocks including AAPL rose on renewed AI spending.',
        url: 'https://example.com/tech-rally',
        meta_url: { hostname: 'example.com' },
        age: '5 hours ago',
      },
    ],
  };

  it('returns news articles on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => braveSearchResponse,
    });

    const result = await searchNewsTool.execute(
      { query: 'AAPL earnings', days_back: 7 },
      contextWithKey,
    );
    expect(result.success).toBe(true);

    const data = result.data as { articles: Array<{ title: string }>; query: string; totalResults: number };
    expect(data.query).toBe('AAPL earnings');
    expect(data.articles).toHaveLength(2);
    expect(data.articles[0].title).toBe('Apple Reports Q4 Earnings Beat');
    expect(data.totalResults).toBe(2);
  });

  it('passes correct freshness for days_back <= 1', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searchNewsTool.execute({ query: 'test', days_back: 1 }, contextWithKey);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('freshness=pd');
  });

  it('passes correct freshness for days_back <= 7', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searchNewsTool.execute({ query: 'test', days_back: 5 }, contextWithKey);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('freshness=pw');
  });

  it('passes correct freshness for days_back > 7', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searchNewsTool.execute({ query: 'test', days_back: 14 }, contextWithKey);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('freshness=pm');
  });

  it('sends API key as subscription token header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searchNewsTool.execute({ query: 'test', days_back: 7 }, contextWithKey);
    const fetchOptions = mockFetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(fetchOptions.headers['X-Subscription-Token']).toBe('test-brave-api-key');
  });

  it('returns error when no API key configured', async () => {
    const result = await searchNewsTool.execute(
      { query: 'test', days_back: 7 },
      contextNoKey,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('News API key not configured');
  });

  it('returns error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await searchNewsTool.execute(
      { query: 'test', days_back: 7 },
      contextWithKey,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('uses default days_back of 7', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = await searchNewsTool.execute({ query: 'test' }, contextWithKey);
    expect(result.success).toBe(true);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('freshness=pw'); // 7 days = pw
  });
});
