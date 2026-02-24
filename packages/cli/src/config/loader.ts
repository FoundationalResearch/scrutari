import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { parse, stringify } from 'yaml';
import { ConfigSchema, ConfigDefaults, type RawConfig, type Config, type ProviderId } from './schema.js';

const DEFAULT_CONFIG_PATH = '.scrutari/config.yaml';

function getDefaultConfigPath(): string {
  return resolve(homedir(), DEFAULT_CONFIG_PATH);
}

function expandTilde(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

function resolveEnvVar(value: string): string {
  if (value.startsWith('env:')) {
    const envKey = value.slice(4);
    const envVal = process.env[envKey];
    return envVal ? envVal : value;
  }
  if (value.startsWith('${') && value.endsWith('}')) {
    const envKey = value.slice(2, -1);
    const envVal = process.env[envKey];
    return envVal ? envVal : value;
  }
  if (value.startsWith('$')) {
    const envKey = value.slice(1);
    const envVal = process.env[envKey];
    return envVal ? envVal : value;
  }
  return value;
}

function stripNullValues(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== null).map(stripNullValues);
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== null) {
        result[key] = stripNullValues(value);
      }
    }
    return result;
  }
  return obj;
}

function resolveEnvVarsInObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'string') {
    return resolveEnvVar(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsInObject);
  }
  if (typeof obj === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVarsInObject(value);
    }
    return resolved;
  }
  return obj;
}

export interface LoadConfigOptions {
  configPath?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isUnresolvedEnvRef(value: string | undefined): boolean {
  if (!value) return false;
  return value.startsWith('env:') || value.startsWith('$');
}

/**
 * Apply environment variable fallbacks for API keys.
 * If a provider's api_key is not set or is an unresolved env ref, check the standard env var.
 */
function applyEnvVarFallbacks(config: Config): void {
  // Clear unresolved env var references (e.g. "env:ANTHROPIC_API_KEY" when env var is not set)
  if (isUnresolvedEnvRef(config.providers.anthropic.api_key)) {
    config.providers.anthropic.api_key = undefined;
  }
  if (isUnresolvedEnvRef(config.providers.openai.api_key)) {
    config.providers.openai.api_key = undefined;
  }
  if (isUnresolvedEnvRef(config.providers.google.api_key)) {
    config.providers.google.api_key = undefined;
  }
  if (isUnresolvedEnvRef(config.providers.minimax.api_key)) {
    config.providers.minimax.api_key = undefined;
  }

  // Apply env var fallbacks
  if (!config.providers.anthropic.api_key) {
    const envKey = process.env['ANTHROPIC_API_KEY'];
    if (envKey) {
      config.providers.anthropic.api_key = envKey;
    }
  }
  if (!config.providers.openai.api_key) {
    const envKey = process.env['OPENAI_API_KEY'];
    if (envKey) {
      config.providers.openai.api_key = envKey;
    }
  }
  if (!config.providers.google.api_key) {
    const envKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
    if (envKey) {
      config.providers.google.api_key = envKey;
    }
  }
  if (!config.providers.minimax.api_key) {
    const envKey = process.env['MINIMAX_API_KEY'];
    if (envKey) {
      config.providers.minimax.api_key = envKey;
    }
  }

  // Clear unresolved env var references for tool API keys
  if (isUnresolvedEnvRef(config.tools.market_data.api_key)) {
    config.tools.market_data.api_key = undefined;
  }

  // Apply env var fallback for RapidAPI key (market data)
  if (!config.tools.market_data.api_key) {
    const envKey = process.env['RAPIDAPI_KEY'];
    if (envKey) {
      config.tools.market_data.api_key = envKey;
    }
  }

  // Clear unresolved env var references for MarketOnePager
  if (isUnresolvedEnvRef(config.tools.marketonepager.api_key)) {
    config.tools.marketonepager.api_key = undefined;
  }
  if (isUnresolvedEnvRef(config.tools.marketonepager.url)) {
    config.tools.marketonepager.url = undefined;
  }

  // Apply env var fallback for MarketOnePager
  if (!config.tools.marketonepager.api_key) {
    const envKey = process.env['MARKETONEPAGER_KEY'];
    if (envKey) {
      config.tools.marketonepager.api_key = envKey;
    }
  }
  if (!config.tools.marketonepager.url) {
    const envUrl = process.env['MARKETONEPAGER_URL'];
    if (envUrl) {
      config.tools.marketonepager.url = envUrl;
    }
  }

  // Clear unresolved env var references for news API
  if (isUnresolvedEnvRef(config.tools.news.api_key)) {
    config.tools.news.api_key = undefined;
  }

  // Apply env var fallback for Brave Search (news)
  if (!config.tools.news.api_key) {
    const envKey = process.env['BRAVE_API_KEY'];
    if (envKey) {
      config.tools.news.api_key = envKey;
    }
  }
}

export interface LoadConfigResult {
  config: Config;
  configFileExists: boolean;
  envKeysUsed: string[];
}

export function loadConfig(options: LoadConfigOptions = {}): Config {
  return loadConfigWithMeta(options).config;
}

export function loadConfigWithMeta(options: LoadConfigOptions = {}): LoadConfigResult {
  const configPath = getConfigPath(options.configPath);
  const configFileExists = existsSync(configPath);

  let result: Config;

  if (!configFileExists) {
    result = JSON.parse(JSON.stringify(ConfigDefaults)) as Config;
  } else {
    let fileContent: string;
    try {
      fileContent = readFileSync(configPath, 'utf-8');
    } catch (error) {
      throw new ConfigError(`Failed to read config file: ${configPath}`);
    }

    let rawConfig: unknown;
    try {
      rawConfig = parse(fileContent);
    } catch (error) {
      throw new ConfigError(`Failed to parse config file: ${configPath}`);
    }

    if (rawConfig === null || rawConfig === undefined) {
      result = JSON.parse(JSON.stringify(ConfigDefaults)) as Config;
    } else {
      const strippedConfig = stripNullValues(rawConfig);
      const resolvedConfig = resolveEnvVarsInObject(strippedConfig) as RawConfig;

      const validated = ConfigSchema.safeParse(resolvedConfig);

      if (!validated.success) {
        const issues = validated.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ConfigError(`Invalid config: ${issues}`);
      }

      result = JSON.parse(JSON.stringify(ConfigDefaults)) as Config;

      if (validated.data.defaults) {
        result.defaults = { ...result.defaults, ...validated.data.defaults };
      }
      if (validated.data.skills_dir) {
        result.skills_dir = validated.data.skills_dir;
      }
      if (validated.data.providers) {
        result.providers = {
          anthropic: { ...result.providers.anthropic, ...validated.data.providers.anthropic },
          openai: { ...result.providers.openai, ...validated.data.providers.openai },
          google: { ...result.providers.google, ...validated.data.providers.google },
          minimax: { ...result.providers.minimax, ...validated.data.providers.minimax },
        };
      }
      if (validated.data.mcp?.servers) {
        result.mcp.servers = [...result.mcp.servers, ...validated.data.mcp.servers];
      }
      if (validated.data.agents) {
        result.agents = {
          research: { ...result.agents.research, ...validated.data.agents.research },
          explore: { ...result.agents.explore, ...validated.data.agents.explore },
          verify: { ...result.agents.verify, ...validated.data.agents.verify },
          default: { ...result.agents.default, ...validated.data.agents.default },
        };
      }
      if (validated.data.compaction) {
        result.compaction = { ...result.compaction, ...validated.data.compaction };
      }
      if (validated.data.permissions) {
        result.permissions = { ...result.permissions, ...validated.data.permissions };
      }
      if (validated.data.tools) {
        result.tools = {
          market_data: { ...result.tools.market_data, ...validated.data.tools.market_data },
          marketonepager: { ...result.tools.marketonepager, ...validated.data.tools.marketonepager },
          news: { ...result.tools.news, ...validated.data.tools.news },
        };
      }
    }
  }

  // Track which env vars provide API keys (before applying fallbacks)
  const envKeysUsed: string[] = [];
  if (!result.providers.anthropic.api_key && process.env['ANTHROPIC_API_KEY']) {
    envKeysUsed.push('ANTHROPIC_API_KEY');
  }
  if (!result.providers.openai.api_key && process.env['OPENAI_API_KEY']) {
    envKeysUsed.push('OPENAI_API_KEY');
  }
  if (!result.providers.google.api_key) {
    if (process.env['GEMINI_API_KEY']) {
      envKeysUsed.push('GEMINI_API_KEY');
    } else if (process.env['GOOGLE_API_KEY']) {
      envKeysUsed.push('GOOGLE_API_KEY');
    }
  }
  if (!result.providers.minimax.api_key && process.env['MINIMAX_API_KEY']) {
    envKeysUsed.push('MINIMAX_API_KEY');
  }
  if (!result.tools.market_data.api_key && process.env['RAPIDAPI_KEY']) {
    envKeysUsed.push('RAPIDAPI_KEY');
  }
  if (!result.tools.marketonepager.api_key && process.env['MARKETONEPAGER_KEY']) {
    envKeysUsed.push('MARKETONEPAGER_KEY');
  }
  if (!result.tools.news.api_key && process.env['BRAVE_API_KEY']) {
    envKeysUsed.push('BRAVE_API_KEY');
  }

  applyEnvVarFallbacks(result);

  // Auto-select provider if the default provider has no API key
  if (!result.providers[result.defaults.provider].api_key) {
    const providerPriority: ProviderId[] = ['anthropic', 'openai', 'google', 'minimax'];
    const available = providerPriority.find(p => result.providers[p].api_key);
    if (available) {
      result.defaults.provider = available;
      result.defaults.model = result.providers[available].default_model;
    }
  }

  return { config: result, configFileExists, envKeysUsed };
}

export function getConfigPath(configPath?: string): string {
  if (configPath) {
    return expandTilde(configPath);
  }
  return getDefaultConfigPath();
}

export function setConfigValue(key: string, value: string, options: LoadConfigOptions = {}): void {
  const configPath = getConfigPath(options.configPath);

  if (!existsSync(configPath)) {
    throw new ConfigError(`Config file not found: ${configPath}. Run 'scrutari config init' first.`);
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(configPath, 'utf-8');
  } catch {
    throw new ConfigError(`Failed to read config file: ${configPath}`);
  }

  let doc: Record<string, unknown>;
  try {
    doc = (parse(fileContent) as Record<string, unknown>) ?? {};
  } catch {
    throw new ConfigError(`Failed to parse config file: ${configPath}`);
  }

  // Navigate dot-notation key
  const keys = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = doc;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  const lastKey = keys[keys.length - 1];

  // Type coercion
  const numValue = Number(value);
  if (!isNaN(numValue) && value.trim() !== '') {
    current[lastKey] = numValue;
  } else if (value === 'true') {
    current[lastKey] = true;
  } else if (value === 'false') {
    current[lastKey] = false;
  } else {
    current[lastKey] = value;
  }

  // Validate modified config (strip nulls from YAML comments)
  const validated = ConfigSchema.safeParse(stripNullValues(doc));
  if (!validated.success) {
    const issues = validated.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new ConfigError(`Invalid config after setting ${key}: ${issues}`);
  }

  writeFileSync(configPath, stringify(doc), 'utf-8');
}

export interface McpServerEntry {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

/**
 * Read the raw YAML config and return the mcp.servers array.
 * Preserves env var references (not resolved) for display purposes.
 */
function readRawMcpServers(configPath: string): { doc: Record<string, unknown>; servers: Array<Record<string, unknown>> } {
  if (!existsSync(configPath)) {
    return { doc: {}, servers: [] };
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(configPath, 'utf-8');
  } catch {
    throw new ConfigError(`Failed to read config file: ${configPath}`);
  }

  let doc: Record<string, unknown>;
  try {
    doc = (parse(fileContent) as Record<string, unknown>) ?? {};
  } catch {
    throw new ConfigError(`Failed to parse config file: ${configPath}`);
  }

  const mcpSection = doc.mcp as Record<string, unknown> | undefined;
  const servers = (mcpSection?.servers ?? []) as Array<Record<string, unknown>>;
  return { doc, servers };
}

/**
 * Add an MCP server to the config file.
 * Creates the config file and directories if they don't exist.
 * Rejects duplicate server names.
 */
export function addMcpServer(server: McpServerEntry, options: LoadConfigOptions = {}): void {
  const configPath = getConfigPath(options.configPath);

  // Create config file + directories if they don't exist
  if (!existsSync(configPath)) {
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, '', 'utf-8');
  }

  const { doc, servers } = readRawMcpServers(configPath);

  // Check for duplicates
  const existing = servers.find(s => s.name === server.name);
  if (existing) {
    throw new ConfigError(
      `MCP server "${server.name}" already exists. Use "scrutari mcp remove ${server.name}" first, then add again.`
    );
  }

  // Build the entry (only include defined fields)
  const entry: Record<string, unknown> = { name: server.name };
  if (server.command) entry.command = server.command;
  if (server.args && server.args.length > 0) entry.args = server.args;
  if (server.url) entry.url = server.url;
  if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers;
  if (server.env && Object.keys(server.env).length > 0) entry.env = server.env;

  // Ensure mcp.servers exists in the doc
  if (!doc.mcp || typeof doc.mcp !== 'object') {
    doc.mcp = { servers: [] };
  }
  const mcpSection = doc.mcp as Record<string, unknown>;
  if (!Array.isArray(mcpSection.servers)) {
    mcpSection.servers = [];
  }
  (mcpSection.servers as Array<Record<string, unknown>>).push(entry);

  // Validate
  const validated = ConfigSchema.safeParse(stripNullValues(doc));
  if (!validated.success) {
    const issues = validated.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new ConfigError(`Invalid config after adding MCP server: ${issues}`);
  }

  writeFileSync(configPath, stringify(doc), 'utf-8');
}

/**
 * Remove an MCP server from the config file by name.
 * Returns true if a server was found and removed, false otherwise.
 */
export function removeMcpServer(name: string, options: LoadConfigOptions = {}): boolean {
  const configPath = getConfigPath(options.configPath);

  if (!existsSync(configPath)) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

  const { doc, servers } = readRawMcpServers(configPath);

  const index = servers.findIndex(s => s.name === name);
  if (index === -1) {
    return false;
  }

  servers.splice(index, 1);

  // Update the doc
  const mcpSection = doc.mcp as Record<string, unknown>;
  mcpSection.servers = servers;

  writeFileSync(configPath, stringify(doc), 'utf-8');
  return true;
}

/**
 * Get all configured MCP servers from the raw config.
 * Preserves env var references for display.
 */
export function getMcpServers(options: LoadConfigOptions = {}): McpServerEntry[] {
  const configPath = getConfigPath(options.configPath);
  const { servers } = readRawMcpServers(configPath);
  return servers as unknown as McpServerEntry[];
}

/**
 * Get a single MCP server by name from the raw config.
 */
export function getMcpServer(name: string, options: LoadConfigOptions = {}): McpServerEntry | undefined {
  const servers = getMcpServers(options);
  return servers.find(s => s.name === name);
}
