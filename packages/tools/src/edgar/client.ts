import type { ToolContext } from '../types.js';
import { fetchWithRetry } from '../retry.js';

const EDGAR_BASE = 'https://efts.sec.gov/LATEST';
const EDGAR_DATA = 'https://data.sec.gov';
const SEC_COMPANY_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const DEFAULT_USER_AGENT = 'scrutari-cli/0.1 (scrutari@example.com)';

// SEC rate limit: max 10 requests/second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 110; // ~9 req/s to stay safely under 10

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function getUserAgent(context: ToolContext): string {
  return context.config.userAgent ?? DEFAULT_USER_AGENT;
}

export async function fetchEdgar(
  url: string,
  context: ToolContext,
): Promise<Response> {
  await rateLimit();
  return fetchWithRetry(
    url,
    {
      headers: {
        'User-Agent': getUserAgent(context),
        'Accept': 'application/json',
      },
      signal: context.abortSignal,
    },
    { maxRetries: 3, initialDelayMs: 1000, backoffMultiplier: 2 },
  );
}

// CIK lookup cache
const cikCache = new Map<string, string>();

export async function lookupCIK(ticker: string, context: ToolContext): Promise<string> {
  const upper = ticker.toUpperCase();
  if (cikCache.has(upper)) {
    return cikCache.get(upper)!;
  }

  const response = await fetchEdgar(SEC_COMPANY_TICKERS, context);
  const data = await response.json() as Record<string, { cik_str: number; ticker: string }>;

  for (const entry of Object.values(data)) {
    if (entry.ticker.toUpperCase() === upper) {
      const cik = String(entry.cik_str).padStart(10, '0');
      cikCache.set(upper, cik);
      return cik;
    }
  }

  throw new Error(`CIK not found for ticker: ${ticker}`);
}

export interface EdgarSearchResult {
  filings: Array<{
    accessionNumber: string;
    filingDate: string;
    form: string;
    primaryDocument: string;
    companyName: string;
  }>;
  totalHits: number;
}

export async function searchFilings(
  ticker: string,
  filingType: string | undefined,
  dateRange: string | undefined,
  context: ToolContext,
): Promise<EdgarSearchResult> {
  const params = new URLSearchParams();
  params.set('q', ticker);
  if (filingType) params.set('forms', filingType);
  if (dateRange) params.set('dateRange', dateRange);
  params.set('from', '0');
  params.set('size', '10');

  const url = `${EDGAR_BASE}/search-index?${params.toString()}`;
  const response = await fetchEdgar(url, context);
  const data = await response.json() as {
    hits?: {
      total?: { value?: number };
      hits?: Array<{
        _source: {
          file_num?: string;
          display_names?: string[];
          form_type?: string;
          file_date?: string;
          period_of_report?: string;
        };
        _id: string;
      }>;
    };
  };

  const hits = data.hits?.hits ?? [];
  return {
    filings: hits.map(hit => ({
      accessionNumber: hit._id,
      filingDate: hit._source.file_date ?? '',
      form: hit._source.form_type ?? '',
      primaryDocument: hit._id,
      companyName: hit._source.display_names?.[0] ?? '',
    })),
    totalHits: data.hits?.total?.value ?? 0,
  };
}

export async function getFiling(
  accessionNumber: string,
  context: ToolContext,
): Promise<string> {
  const cleanAccession = accessionNumber.replace(/-/g, '');
  const url = `${EDGAR_DATA}/Archives/edgar/data/${cleanAccession}`;

  const response = await fetchEdgar(url, context);
  const text = await response.text();
  // Truncate very long filings for LLM context
  return text.length > 50000 ? text.slice(0, 50000) + '\n\n[... truncated ...]' : text;
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, {
    label: string;
    description: string;
    units: Record<string, Array<{
      val: number;
      accn: string;
      fy: number;
      fp: string;
      form: string;
      filed: string;
      end: string;
    }>>;
  }>>;
}

export async function getFinancials(
  ticker: string,
  context: ToolContext,
): Promise<CompanyFacts> {
  const cik = await lookupCIK(ticker, context);
  const url = `${EDGAR_DATA}/api/xbrl/companyfacts/CIK${cik}.json`;
  const response = await fetchEdgar(url, context);
  return await response.json() as CompanyFacts;
}
