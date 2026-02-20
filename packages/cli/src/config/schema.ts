import { z } from 'zod';

const envVarPattern = /^(env:|\\?\$\{?)/;

const envVarSchema = z.string().refine(
  (val) => envVarPattern.test(val),
  { message: 'Must start with env:, $, or ${' }
).brand('envVar');

export type EnvVar = z.infer<typeof envVarSchema>;

const apiKeySchema = z.union([
  envVarSchema,
  z.string().min(1),
]);

const providerConfigSchema = z.object({
  api_key: apiKeySchema.optional(),
  default_model: z.string().optional(),
}).strict();

const providersSchema = z.object({
  anthropic: providerConfigSchema.optional(),
  openai: providerConfigSchema.optional(),
  google: providerConfigSchema.optional(),
}).strict();

const defaultsSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google']).optional(),
  model: z.string().optional(),
  max_budget_usd: z.number().positive().optional(),
  output_format: z.enum(['markdown', 'json', 'docx']).optional(),
  output_dir: z.string().optional(),
}).strict();

const mcpServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
}).strict().superRefine((server, ctx) => {
  const hasCommand = typeof server.command === 'string' && server.command.length > 0;
  const hasUrl = typeof server.url === 'string' && server.url.length > 0;

  if (hasCommand === hasUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'MCP server must define exactly one of command or url',
      path: ['command'],
    });
  }

  if (!hasCommand && server.args) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'MCP server args require command',
      path: ['args'],
    });
  }
});

const mcpSchema = z.object({
  servers: z.array(mcpServerSchema).optional(),
}).strict();

const ConfigSchema = z.object({
  providers: providersSchema.optional(),
  defaults: defaultsSchema.optional(),
  mcp: mcpSchema.optional(),
  skills_dir: z.string().optional(),
}).strict();

export type RawConfig = z.infer<typeof ConfigSchema>;

export type ProviderId = 'anthropic' | 'openai' | 'google';
export type OutputFormat = 'markdown' | 'json' | 'docx';

export interface ResolvedProviderConfig {
  api_key?: string;
  default_model: string;
}

export interface ResolvedMcpServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
}

export interface Config {
  providers: {
    anthropic: ResolvedProviderConfig;
    openai: ResolvedProviderConfig;
    google: ResolvedProviderConfig;
  };
  defaults: {
    provider: ProviderId;
    model: string;
    max_budget_usd: number;
    output_format: OutputFormat;
    output_dir: string;
  };
  mcp: {
    servers: ResolvedMcpServerConfig[];
  };
  skills_dir: string;
}

export const ConfigDefaults: Config = {
  defaults: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    max_budget_usd: 5.0,
    output_format: 'markdown' as const,
    output_dir: './output',
  },
  skills_dir: '~/.scrutari/skills',
  providers: {
    anthropic: {
      default_model: 'claude-sonnet-4-20250514',
    },
    openai: {
      default_model: 'gpt-4o',
    },
    google: {
      default_model: 'gemini-2.5-flash',
    },
  },
  mcp: {
    servers: [],
  },
};

export { ConfigSchema };
