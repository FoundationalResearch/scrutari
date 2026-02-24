import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getQuoteTool, getHistoryTool, getMarketFinancialsTool } from './tools.js';
import { clearCache } from './client.js';
import type { ToolContext } from '../types.js';

const mockContext: ToolContext = {
  config: {
    marketDataApiKey: 'test-rapidapi-key',
  },
};

const noKeyContext: ToolContext = {
  config: {},
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  clearCache();
});

describe('getQuoteTool', () => {
  const rapidAPIQuoteResponse = {
    quoteResponse: {
      result: [
        {
          regularMarketPrice: 178.72,
          regularMarketPreviousClose: 175.10,
          regularMarketChange: 3.62,
          regularMarketChangePercent: 2.067,
          regularMarketVolume: 65432100,
          marketCap: 2780000000000,
          fiftyTwoWeekHigh: 199.62,
          fiftyTwoWeekLow: 124.17,
          currency: 'USD',
          fullExchangeName: 'NasdaqGS',
          shortName: 'Apple Inc.',
        },
      ],
    },
  };

  it('returns quote data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIQuoteResponse,
    });

    const result = await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(true);

    const data = result.data as { ticker: string; price: number; change: number; changePercent: number };
    expect(data.ticker).toBe('AAPL');
    expect(data.price).toBe(178.72);
    expect(data.change).toBe(3.62);
    expect(data.changePercent).toBe(2.067);
  });

  it('sends RapidAPI headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIQuoteResponse,
    });

    await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);

    const calledOptions = mockFetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(calledOptions.headers['X-RapidAPI-Key']).toBe('test-rapidapi-key');
    expect(calledOptions.headers['X-RapidAPI-Host']).toBe('apidojo-yahoo-finance-v1.p.rapidapi.com');
  });

  it('calls the RapidAPI quotes endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIQuoteResponse,
    });

    await getQuoteTool.execute({ ticker: 'AAPL' }, mockContext);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('apidojo-yahoo-finance-v1.p.rapidapi.com/market/get-quotes');
    expect(calledUrl).toContain('symbols=AAPL');
  });

  it('uses cache on repeated calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIQuoteResponse,
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
      json: async () => ({ quoteResponse: { result: [] } }),
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

  it('returns error when API key is not configured', async () => {
    const result = await getQuoteTool.execute({ ticker: 'AAPL' }, noKeyContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Market data API key not configured');
    expect(result.error).toContain('RAPIDAPI_KEY');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('getHistoryTool', () => {
  const rapidAPIChartResponse = {
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
      json: async () => rapidAPIChartResponse,
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

  it('calls the RapidAPI chart endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIChartResponse,
    });

    await getHistoryTool.execute({ ticker: 'AAPL', period: '1m' }, mockContext);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('apidojo-yahoo-finance-v1.p.rapidapi.com/stock/v2/get-chart');
    expect(calledUrl).toContain('symbol=AAPL');
  });

  it('uses default period of 1y', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIChartResponse,
    });

    await getHistoryTool.execute({ ticker: 'AAPL' }, mockContext);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('range=1y');
  });

  it('maps period abbreviations correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => rapidAPIChartResponse,
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

  it('returns error when API key is not configured', async () => {
    const result = await getHistoryTool.execute({ ticker: 'AAPL', period: '1m' }, noKeyContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Market data API key not configured');
    expect(mockFetch).not.toHaveBeenCalled();
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

  it('calls the RapidAPI financials endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        quoteSummary: {
          result: [{ incomeStatementHistory: {} }],
        },
      }),
    });

    await getMarketFinancialsTool.execute({ ticker: 'AAPL' }, mockContext);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('apidojo-yahoo-finance-v1.p.rapidapi.com/stock/v2/get-financials');
    expect(calledUrl).toContain('symbol=AAPL');
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

  it('returns error when API key is not configured', async () => {
    const result = await getMarketFinancialsTool.execute({ ticker: 'AAPL' }, noKeyContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Market data API key not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
