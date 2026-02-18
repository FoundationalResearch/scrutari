import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { getQuote, getHistory, getMarketFinancials } from './client.js';

const GetQuoteParams = z.object({
  ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
});

const GetHistoryParams = z.object({
  ticker: z.string().describe('Stock ticker symbol'),
  period: z.enum(['1w', '1m', '3m', '6m', '1y', '2y', '5y']).default('1y')
    .describe('Historical price period'),
});

const GetFinancialsParams = z.object({
  ticker: z.string().describe('Stock ticker symbol'),
});

export const getQuoteTool: ToolDefinition = {
  name: 'market_data_get_quote',
  description: 'Get current stock quote data including price, volume, market cap, and 52-week range for a given ticker symbol.',
  parameters: GetQuoteParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = GetQuoteParams.parse(params);
    try {
      const quote = await getQuote(parsed.ticker, context);
      return {
        success: true,
        data: quote,
        source: {
          url: `https://finance.yahoo.com/quote/${parsed.ticker}`,
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

export const getHistoryTool: ToolDefinition = {
  name: 'market_data_get_history',
  description: 'Get historical price data for a stock including open, high, low, close, and volume for each trading day over a specified period.',
  parameters: GetHistoryParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = GetHistoryParams.parse(params);
    try {
      const history = await getHistory(parsed.ticker, parsed.period, context);
      return {
        success: true,
        data: history,
        source: {
          url: `https://finance.yahoo.com/quote/${parsed.ticker}/history`,
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

export const getMarketFinancialsTool: ToolDefinition = {
  name: 'market_data_get_financials',
  description: 'Get financial statements (income statement, balance sheet, cash flow) for a company from Yahoo Finance.',
  parameters: GetFinancialsParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = GetFinancialsParams.parse(params);
    try {
      const financials = await getMarketFinancials(parsed.ticker, context);
      return {
        success: true,
        data: financials,
        source: {
          url: `https://finance.yahoo.com/quote/${parsed.ticker}/financials`,
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

export const marketDataTools: ToolDefinition[] = [
  getQuoteTool,
  getHistoryTool,
  getMarketFinancialsTool,
];
