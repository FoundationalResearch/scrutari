import type { ToolContext } from '../types.js';
import { fetchWithRetry } from '../retry.js';

const RAPIDAPI_HOST = 'apidojo-yahoo-finance-v1.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

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

function getApiKey(context: ToolContext): string {
  const apiKey = context.config.marketDataApiKey;
  if (!apiKey) {
    throw new Error(
      'Market data API key not configured. Set tools.market_data.api_key in ~/.scrutari/config.yaml ' +
      'with a RapidAPI key from https://rapidapi.com/apidojo/api/yahoo-finance1, ' +
      'or set the RAPIDAPI_KEY environment variable.',
    );
  }
  return apiKey;
}

async function fetchRapidAPI(
  path: string,
  params: Record<string, string>,
  context: ToolContext,
): Promise<unknown> {
  const apiKey = getApiKey(context);
  const url = `${RAPIDAPI_BASE}${path}?${new URLSearchParams(params).toString()}`;

  const response = await fetchWithRetry(
    url,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      signal: context.abortSignal,
    },
    { maxRetries: 2, initialDelayMs: 1000, backoffMultiplier: 2 },
  );

  return response.json();
}

/**
 * Fetch RapidAPI with cache fallback: if the API call fails after retries,
 * return stale cached data if available.
 */
async function fetchRapidAPIWithFallback<T>(
  path: string,
  params: Record<string, string>,
  cacheKey: string,
  context: ToolContext,
): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await fetchRapidAPI(path, params, context) as T;
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

  type QuotesResponse = {
    quoteResponse?: {
      result?: Array<{
        regularMarketPrice?: number;
        regularMarketPreviousClose?: number;
        regularMarketChange?: number;
        regularMarketChangePercent?: number;
        regularMarketVolume?: number;
        marketCap?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        currency?: string;
        fullExchangeName?: string;
        shortName?: string;
      }>;
    };
  };

  const { data } = await fetchRapidAPIWithFallback<QuotesResponse>(
    '/market/get-quotes',
    { symbols: ticker, region: 'US' },
    cacheKey,
    context,
  );

  const result = data.quoteResponse?.result?.[0];

  if (!result) {
    throw new Error(`No quote data found for ${ticker}`);
  }

  const quote: QuoteData = {
    ticker,
    price: result.regularMarketPrice ?? null,
    previousClose: result.regularMarketPreviousClose ?? null,
    change: result.regularMarketChange ?? null,
    changePercent: result.regularMarketChangePercent ?? null,
    volume: result.regularMarketVolume ?? null,
    marketCap: result.marketCap ?? null,
    fiftyTwoWeekHigh: result.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: result.fiftyTwoWeekLow ?? null,
    currency: result.currency ?? 'USD',
    exchange: result.fullExchangeName ?? '',
    name: result.shortName ?? ticker,
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

  type ChartResponse = {
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

  const { data } = await fetchRapidAPIWithFallback<ChartResponse>(
    '/stock/v2/get-chart',
    { symbol: ticker, interval: '1d', range, region: 'US' },
    cacheKey,
    context,
  );

  const chartResult = data.chart?.result?.[0];
  const timestamps = chartResult?.timestamp ?? [];
  const quoteData = chartResult?.indicators?.quote?.[0] ?? {};

  const prices: HistoricalPrice[] = timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    open: quoteData.open?.[i] ?? null,
    high: quoteData.high?.[i] ?? null,
    low: quoteData.low?.[i] ?? null,
    close: quoteData.close?.[i] ?? null,
    volume: quoteData.volume?.[i] ?? null,
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

  type FinancialsResponse = {
    quoteSummary?: {
      result?: Array<{
        incomeStatementHistory?: unknown;
        balanceSheetHistory?: unknown;
        cashflowStatementHistory?: unknown;
      }>;
    };
  };

  const { data } = await fetchRapidAPIWithFallback<FinancialsResponse>(
    '/stock/v2/get-financials',
    { symbol: ticker, region: 'US' },
    cacheKey,
    context,
  );

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
