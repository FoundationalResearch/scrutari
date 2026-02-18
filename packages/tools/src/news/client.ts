import type { ToolContext } from '../types.js';
import { fetchWithRetry } from '../retry.js';

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/news/search';

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

export interface NewsSearchResult {
  articles: NewsArticle[];
  query: string;
  totalResults: number;
}

export async function searchNews(
  query: string,
  daysBack: number,
  context: ToolContext,
): Promise<NewsSearchResult> {
  const apiKey = context.config.newsApiKey;
  if (!apiKey) {
    throw new Error(
      'News API key not configured. Set tools.news.api_key in ~/.scrutari/config.yaml ' +
      'with a Brave Search API key from https://api.search.brave.com',
    );
  }

  const params = new URLSearchParams({
    q: query,
    count: '20',
    freshness: daysBack <= 1 ? 'pd' : daysBack <= 7 ? 'pw' : 'pm',
  });

  const response = await fetchWithRetry(
    `${BRAVE_SEARCH_URL}?${params.toString()}`,
    {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: context.abortSignal,
    },
    { maxRetries: 2, initialDelayMs: 1000 },
  );

  const data = await response.json() as {
    results?: Array<{
      title?: string;
      description?: string;
      url?: string;
      meta_url?: { hostname?: string };
      age?: string;
    }>;
  };

  const articles: NewsArticle[] = (data.results ?? []).map(r => ({
    title: r.title ?? '',
    description: r.description ?? '',
    url: r.url ?? '',
    source: r.meta_url?.hostname ?? '',
    publishedAt: r.age ?? '',
  }));

  return {
    articles,
    query,
    totalResults: articles.length,
  };
}
