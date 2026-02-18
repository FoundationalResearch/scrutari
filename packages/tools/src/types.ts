import { z } from 'zod';

export interface ToolContext {
  /** User configuration (API keys, email for SEC User-Agent, etc.) */
  config: ToolConfig;
  /** Abort signal for cancellation support */
  abortSignal?: AbortSignal;
}

export interface ToolConfig {
  /** Email for SEC EDGAR User-Agent header (required by SEC) */
  userAgent?: string;
  /** News API key */
  newsApiKey?: string;
  /** Generic tool-level config overrides */
  [key: string]: unknown;
}

export interface ToolSource {
  url?: string;
  document?: string;
  accessedAt: string;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  source?: ToolSource;
}

export interface ToolDefinition {
  /** Unique tool name (e.g., 'sec-edgar.search_filings') */
  name: string;
  /** Human-readable description for LLM */
  description: string;
  /** Zod schema defining tool input parameters */
  parameters: z.ZodSchema;
  /** Execute the tool with validated parameters */
  execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolGroup {
  /** Group name (e.g., 'sec-edgar', 'market-data', 'news') */
  name: string;
  /** Human-readable description */
  description: string;
  /** All tool definitions in this group */
  tools: ToolDefinition[];
}
