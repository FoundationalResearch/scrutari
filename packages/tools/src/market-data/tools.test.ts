import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getQuoteTool, getHistoryTool, getMarketFinancialsTool } from './tools.js';
import { clearCache } from './client.js';
import type { ToolContext } from '../types.js';

const mockContext: ToolContext = {
  config: {},
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  clearCache();
});

describe('getQuoteTool', () => {
  const yahooChartResponse = {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: 178.72,
            chartPreviousClose: 175.10,
            currency: 'USD',
            exchangeName: 'NMS',
            shortName: 'Apple Inc.',
            fiftyTwoWeekHigh: 199.62,
            fiftyTwoWeekLow: 124.17,
            regularMarketVolume: 65432100,
            marketCap: 2780000000000,
          },
        },
      ],
    },
  };

  it('returns quote data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => yahooChartResponse,
    });

    const result = await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(true);

    const data = result.data as { ticker: string; price: number; change: number; changePercent: number };
    expect(data.ticker).toBe('AAPL');
    expect(data.price).toBe(178.72);
    expect(data.change).toBeCloseTo(178.72 - 175.10, 2);
    expect(data.changePercent).toBeCloseTo(((178.72 - 175.10) / 175.10) * 100, 2);
  });

  it('uses cache on repeated calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => yahooChartResponse,
    });

    await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);
    const result = await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);

    // fetch should only be called once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('returns error when no data found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: undefined }] } }),
    });

    const result = await getQuoteTool.execute({ ticker: 'INVALID' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No quote data');
  });

  it('returns error on non-retryable API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
    });

    const result = await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });
});

describe('getHistoryTool', () => {
  const yahooHistoryResponse = {
    chart: {
      result: [
        {
          timestamp: [1700000000, 1700086400, 1700172800],
          indicators: {
            quote: [
              {
                open: [150.0, 151.5, 152.0],
                high: [152.0, 153.0, 154.0],
                low: [149.0, 150.5, 151.0],
                close: [151.0, 152.5, 153.5],
                volume: [1000000, 1100000, 1200000],
              },
            ],
          },
        },
      ],
    },
  };

  it('returns historical prices', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => yahooHistoryResponse,
    });

    const result = await getHistoryTool.execute({ ticker: 'AAPL', period: '1m' }, mockContext);
    expect(result.success).toBe(true);

    const data = result.data as { ticker: string; period: string; prices: Array<{ date: string; close: number | null }> };
    expect(data.ticker).toBe('AAPL');
    expect(data.period).toBe('1m');
    expect(data.prices).toHaveLength(3);
    expect(data.prices[0].close).toBe(151.0);
    expect(data.prices[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses default period of 1y', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => yahooHistoryResponse,
    });

    await getHistoryTool.execute({ ticker: 'AAPL' }, mockContext);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('range=1y');
  });

  it('maps period abbreviations correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => yahooHistoryResponse,
    });

    await getHistoryTool.execute({ ticker: 'AAPL', period: '3m' }, mockContext);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('range=3mo');
  });

  it('handles empty results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chart: { result: [{}] } }),
    });

    const result = await getHistoryTool.execute({ ticker: 'AAPL', period: '1m' }, mockContext);
    expect(result.success).toBe(true);
    const data = result.data as { prices: unknown[] };
    expect(data.prices).toHaveLength(0);
  });
});

describe('getMarketFinancialsTool', () => {
  it('returns financial statements', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        quoteSummary: {
          result: [
            {
              incomeStatementHistory: { incomeStatementHistory: [{ revenue: { raw: 394328000000 } }] },
              balanceSheetHistory: { balanceSheetStatements: [{ totalAssets: { raw: 352755000000 } }] },
              cashflowStatementHistory: { cashflowStatements: [{ operatingCashflow: { raw: 122151000000 } }] },
            },
          ],
        },
      }),
    });

    const result = await getMarketFinancialsTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(true);

    const data = result.data as { ticker: string; incomeStatement: unknown; balanceSheet: unknown; cashFlow: unknown };
    expect(data.ticker).toBe('AAPL');
    expect(data.incomeStatement).toBeDefined();
    expect(data.balanceSheet).toBeDefined();
    expect(data.cashFlow).toBeDefined();
  });

  it('returns error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
    });

    const result = await getMarketFinancialsTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });
});
