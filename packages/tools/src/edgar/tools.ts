import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { searchFilings, getFiling, getFinancials } from './client.js';

const SearchFilingsParams = z.object({
  ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
  filing_type: z.string().optional().describe('SEC form type (e.g., 10-K, 10-Q, 8-K)'),
  date_range: z.string().optional().describe('Date range filter (e.g., "custom" with start/end dates)'),
});

const GetFilingParams = z.object({
  accession_number: z.string().describe('SEC filing accession number'),
});

const GetFinancialsParams = z.object({
  ticker: z.string().describe('Stock ticker symbol'),
  period: z.enum(['annual', 'quarterly']).optional().describe('Reporting period filter'),
});

export const searchFilingsTool: ToolDefinition = {
  name: 'edgar_search_filings',
  description: 'Search SEC EDGAR for company filings. Returns a list of filings matching the search criteria including accession numbers, filing dates, and form types.',
  parameters: SearchFilingsParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = SearchFilingsParams.parse(params);
    try {
      const result = await searchFilings(
        parsed.ticker,
        parsed.filing_type,
        parsed.date_range,
        context,
      );
      return {
        success: true,
        data: result,
        source: {
          url: `https://efts.sec.gov/LATEST/search-index?q=${parsed.ticker}`,
          accessedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const getFilingTool: ToolDefinition = {
  name: 'edgar_get_filing',
  description: 'Fetch the content of a specific SEC filing by its accession number. Returns the filing text content.',
  parameters: GetFilingParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = GetFilingParams.parse(params);
    try {
      const content = await getFiling(parsed.accession_number, context);
      return {
        success: true,
        data: { content, accessionNumber: parsed.accession_number },
        source: {
          document: parsed.accession_number,
          accessedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const getFinancialsTool: ToolDefinition = {
  name: 'edgar_get_financials',
  description: 'Fetch structured financial data (XBRL) for a company from SEC EDGAR. Returns revenue, earnings, assets, liabilities, and other financial metrics from company filings.',
  parameters: GetFinancialsParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = GetFinancialsParams.parse(params);
    try {
      const facts = await getFinancials(parsed.ticker, context);

      // Extract key financial metrics from XBRL data
      const usGaap = facts.facts['us-gaap'] ?? {};
      const summary: Record<string, unknown> = {
        entityName: facts.entityName,
        cik: facts.cik,
      };

      // Extract common metrics
      const metrics = [
        'Revenue', 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
        'NetIncomeLoss', 'GrossProfit', 'OperatingIncomeLoss',
        'Assets', 'Liabilities', 'StockholdersEquity',
        'EarningsPerShareBasic', 'EarningsPerShareDiluted',
        'CashAndCashEquivalentsAtCarryingValue',
      ];

      for (const metric of metrics) {
        if (usGaap[metric]) {
          const units = usGaap[metric].units;
          const usdEntries = units['USD'] ?? units['USD/shares'] ?? [];
          // Get most recent entries, filter by period if requested
          const filtered = parsed.period === 'annual'
            ? usdEntries.filter(e => e.fp === 'FY')
            : parsed.period === 'quarterly'
              ? usdEntries.filter(e => e.fp.startsWith('Q'))
              : usdEntries;
          const recent = filtered.slice(-4); // last 4 entries
          if (recent.length > 0) {
            summary[metric] = recent.map(e => ({
              value: e.val,
              period: e.fp,
              year: e.fy,
              filed: e.filed,
              end: e.end,
            }));
          }
        }
      }

      return {
        success: true,
        data: summary,
        source: {
          url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(facts.cik).padStart(10, '0')}.json`,
          accessedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const edgarTools: ToolDefinition[] = [
  searchFilingsTool,
  getFilingTool,
  getFinancialsTool,
];
