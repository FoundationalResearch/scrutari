import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { searchNews } from './client.js';

const SearchNewsParams = z.object({
  query: z.string().describe('Search query for news articles (e.g., "NVDA earnings" or "AI chip shortage")'),
  days_back: z.number().int().min(1).max(30).default(7)
    .describe('Number of days to search back from today'),
});

export const searchNewsTool: ToolDefinition = {
  name: 'news_search',
  description: 'Search for recent news articles on a topic. Useful for getting latest news about companies, market events, and industry trends.',
  parameters: SearchNewsParams,
  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = SearchNewsParams.parse(params);
    try {
      const result = await searchNews(parsed.query, parsed.days_back, context);
      return {
        success: true,
        data: result,
        source: {
          url: `https://search.brave.com/news?q=${encodeURIComponent(parsed.query)}`,
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

export const newsTools: ToolDefinition[] = [searchNewsTool];
