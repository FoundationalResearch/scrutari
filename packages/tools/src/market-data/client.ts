import type { ToolContext } from '../types.js';
import { fetchWithRetry } from '../retry.js';

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_QUOTE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';

// Simple in-memory cache with 5-minute TTL for fresh data,
// but stale entries are kept for fallback on API failures.
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    // Don't delete — keep stale data for fallback
    return undefined;
  }
  return entry.data as T;
}

/** Get stale cache entry (any age) for fallback when API fails. */
function getStaleCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}

async function fetchYahoo(
  url: string,
  context: ToolContext,
): Promise<unknown> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; scrutari-cli/0.1)',
      },
      signal: context.abortSignal,
    },
    { maxRetries: 2, initialDelayMs: 1000, backoffMultiplier: 2 },
  );

  return response.json();
}

/**
 * Fetch Yahoo with cache fallback: if the API call fails after retries,
 * return stale cached data if available.
 */
async function fetchYahooWithFallback<T>(
  url: string,
  cacheKey: string,
  context: ToolContext,
): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await fetchYahoo(url, context) as T;
    return { data, stale: false };
  } catch (err) {
    const stale = getStaleCached<T>(cacheKey);
    if (stale) {
      return { data: stale, stale: true };
    }
    throw err;
  }
}

export interface QuoteData {
  ticker: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  currency: string;
  exchange: string;
  name: string;
}

export async function getQuote(
  ticker: string,
  context: ToolContext,
): Promise<QuoteData> {
  const cacheKey = `quote:${ticker}`;
  const cached = getCached<QuoteData>(cacheKey);
  if (cached) return cached;

  const url = `${YAHOO_QUOTE_URL}/${encodeURIComponent(ticker)}?interval=1d&range=5d`;

  type ChartResponse = {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
          currency?: string;
          exchangeName?: string;
          shortName?: string;
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
          regularMarketVolume?: number;
          marketCap?: number;
          chartPreviousClose?: number;
        };
      }>;
    };
  };

  const { data } = await fetchYahooWithFallback<ChartResponse>(url, cacheKey, context);

  const result = data.chart?.result?.[0];
  const meta = result?.meta;

  if (!meta) {
    throw new Error(`No quote data found for ${ticker}`);
  }

  const price = meta.regularMarketPrice ?? null;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;

  const quote: QuoteData = {
    ticker,
    price,
    previousClose,
    change: price != null && previousClose != null ? price - previousClose : null,
    changePercent: price != null && previousClose != null && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : null,
    volume: meta.regularMarketVolume ?? null,
    marketCap: meta.marketCap ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    currency: meta.currency ?? 'USD',
    exchange: meta.exchangeName ?? '',
    name: meta.shortName ?? ticker,
  };

  setCache(cacheKey, quote);
  return quote;
}

export interface HistoricalPrice {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface HistoryData {
  ticker: string;
  period: string;
  prices: HistoricalPrice[];
}

const PERIOD_MAP: Record<string, string> = {
  '1w': '5d',
  '1m': '1mo',
  '3m': '3mo',
  '6m': '6mo',
  '1y': '1y',
  '2y': '2y',
  '5y': '5y',
};

export async function getHistory(
  ticker: string,
  period: string,
  context: ToolContext,
): Promise<HistoryData> {
  const cacheKey = `history:${ticker}:${period}`;
  const cached = getCached<HistoryData>(cacheKey);
  if (cached) return cached;

  const range = PERIOD_MAP[period] ?? period;
  const url = `${YAHOO_QUOTE_URL}/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;

  type ChartHistoryResponse = {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
    };
  };

  const { data } = await fetchYahooWithFallback<ChartHistoryResponse>(url, cacheKey, context);

  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};

  const prices: HistoricalPrice[] = timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    open: quote.open?.[i] ?? null,
    high: quote.high?.[i] ?? null,
    low: quote.low?.[i] ?? null,
    close: quote.close?.[i] ?? null,
    volume: quote.volume?.[i] ?? null,
  }));

  const history: HistoryData = { ticker, period, prices };
  setCache(cacheKey, history);
  return history;
}

export interface FinancialStatement {
  ticker: string;
  incomeStatement: unknown;
  balanceSheet: unknown;
  cashFlow: unknown;
}

export async function getMarketFinancials(
  ticker: string,
  context: ToolContext,
): Promise<FinancialStatement> {
  const cacheKey = `financials:${ticker}`;
  const cached = getCached<FinancialStatement>(cacheKey);
  if (cached) return cached;

  const modules = 'incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory';
  const url = `${YAHOO_QUOTE_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules}`;

  type SummaryResponse = {
    quoteSummary?: {
      result?: Array<{
        incomeStatementHistory?: unknown;
        balanceSheetHistory?: unknown;
        cashflowStatementHistory?: unknown;
      }>;
    };
  };

  const { data } = await fetchYahooWithFallback<SummaryResponse>(url, cacheKey, context);

  const result = data.quoteSummary?.result?.[0];
  const financials: FinancialStatement = {
    ticker,
    incomeStatement: result?.incomeStatementHistory ?? null,
    balanceSheet: result?.balanceSheetHistory ?? null,
    cashFlow: result?.cashflowStatementHistory ?? null,
  };

  setCache(cacheKey, financials);
  return financials;
}
