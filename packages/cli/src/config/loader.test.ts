import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, loadConfigWithMeta, setConfigValue, ConfigError } from './loader.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const testDir = resolve(homedir(), '.scrutari-test');
const testConfigPath = resolve(testDir, 'config.yaml');

describe('config loader', () => {
  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig({ configPath: testConfigPath });

    expect(config.defaults.provider).toBe('anthropic');
    expect(config.defaults.model).toBe('claude-sonnet-4-20250514');
    expect(config.defaults.max_budget_usd).toBe(5.0);
    expect(config.defaults.output_format).toBe('markdown');
    expect(config.defaults.output_dir).toBe('./output');
    expect(config.skills_dir).toBe('~/.scrutari/skills');
    expect(config.providers.anthropic.default_model).toBe('claude-sonnet-4-20250514');
    expect(config.providers.openai.default_model).toBe('gpt-4o');
    expect(config.providers.google.default_model).toBe('gemini-2.5-flash');
    expect(config.providers.minimax.default_model).toBe('MiniMax-M2');
    expect(config.mcp.servers).toEqual([]);
  });

  it('loads and merges custom config', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
defaults:
  provider: openai
  max_budget_usd: 10.0
skills_dir: ~/my-skills
`);

    const config = loadConfig({ configPath: testConfigPath });
    
    expect(config.defaults.provider).toBe('openai');
    expect(config.defaults.max_budget_usd).toBe(10.0);
    expect(config.defaults.model).toBe('claude-sonnet-4-20250514');
    expect(config.skills_dir).toBe('~/my-skills');
  });

  it('resolves env: prefix from environment variable', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
providers:
  anthropic:
    api_key: env:TEST_API_KEY
`);

    vi.stubEnv('TEST_API_KEY', 'sk-test-key-123');
    
    const config = loadConfig({ configPath: testConfigPath });
    
    expect(config.providers.anthropic.api_key).toBe('sk-test-key-123');
    
  });

  it('resolves $ prefix from environment variable', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
providers:
  openai:
    api_key: $OPENAI_API_KEY
`);

    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-test');
    
    const config = loadConfig({ configPath: testConfigPath });
    
    expect(config.providers.openai.api_key).toBe('sk-openai-test');
    
  });

  it('resolves ${VAR} from environment variable', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
providers:
  anthropic:
    api_key: \${ANTHROPIC_KEY}
`);

    vi.stubEnv('ANTHROPIC_KEY', 'sk-anthropic-braces');
    
    const config = loadConfig({ configPath: testConfigPath });
    
    expect(config.providers.anthropic.api_key).toBe('sk-anthropic-braces');
    
  });

  it('clears unresolved env: refs and treats them as unset', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
providers:
  anthropic:
    api_key: env:NONEXISTENT_VAR
`);

    const config = loadConfig({ configPath: testConfigPath });

    // Unresolved env refs are cleared (treated as "no key configured")
    expect(config.providers.anthropic.api_key).toBeUndefined();
  });

  it('loads Google provider config from YAML', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
providers:
  google:
    api_key: test-google-key
    default_model: gemini-2.5-pro
defaults:
  provider: google
  model: gemini-2.5-pro
`);

    const config = loadConfig({ configPath: testConfigPath });

    expect(config.providers.google.api_key).toBe('test-google-key');
    expect(config.providers.google.default_model).toBe('gemini-2.5-pro');
    expect(config.defaults.provider).toBe('google');
    expect(config.defaults.model).toBe('gemini-2.5-pro');
  });

  it('loads MiniMax provider config from YAML', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
providers:
  minimax:
    api_key: test-minimax-key
    default_model: MiniMax-M2-Stable
defaults:
  provider: minimax
  model: MiniMax-M2-Stable
`);

    const config = loadConfig({ configPath: testConfigPath });

    expect(config.providers.minimax.api_key).toBe('test-minimax-key');
    expect(config.providers.minimax.default_model).toBe('MiniMax-M2-Stable');
    expect(config.defaults.provider).toBe('minimax');
    expect(config.defaults.model).toBe('MiniMax-M2-Stable');
  });

  it('rejects invalid config with zod validation errors', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
defaults:
  max_budget_usd: -5
  output_format: invalid
`);

    expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
  });

  it('returns defaults when config file does not exist', () => {
    expect(() => loadConfig({ configPath: '/nonexistent/path/config.yaml' })).not.toThrow();
  });

  it('expands ~ in configPath override', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
defaults:
  provider: openai
`);

    const config = loadConfig({ configPath: '~/.scrutari-test/config.yaml' });
    expect(config.defaults.provider).toBe('openai');
  });

  it('throws ConfigError when YAML is invalid', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
invalid: yaml: content: [
`);

    expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
  });

  it('loads MCP servers from config', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
mcp:
  servers:
    - name: bloomberg
      command: npx
      args: ["-y", "@bloomberg/mcp"]
`);

    const config = loadConfig({ configPath: testConfigPath });

    expect(config.mcp.servers).toHaveLength(1);
    expect(config.mcp.servers[0].name).toBe('bloomberg');
  });

  it('rejects MCP server config without command or url', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
mcp:
  servers:
    - name: broken
`);

    expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
  });

  it('loads MCP server with headers', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
mcp:
  servers:
    - name: my-api
      url: http://localhost:9000/mcp
      headers:
        X-API-Key: my-secret-key
        Authorization: Bearer tok123
`);

    const config = loadConfig({ configPath: testConfigPath });

    const myApi = config.mcp.servers.find(s => s.name === 'my-api');
    expect(myApi).toBeDefined();
    expect(myApi!.headers).toEqual({
      'X-API-Key': 'my-secret-key',
      'Authorization': 'Bearer tok123',
    });
  });

  it('resolves env vars in MCP server headers', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, `
mcp:
  servers:
    - name: env-api
      url: http://localhost:9000/mcp
      headers:
        X-API-Key: env:TEST_MCP_KEY
`);

    vi.stubEnv('TEST_MCP_KEY', 'resolved-mcp-key');

    const config = loadConfig({ configPath: testConfigPath });

    const envApi = config.mcp.servers.find(s => s.name === 'env-api');
    expect(envApi).toBeDefined();
    expect(envApi!.headers).toEqual({ 'X-API-Key': 'resolved-mcp-key' });
  });

  it('defaults to empty MCP servers list', () => {
    const config = loadConfig({ configPath: testConfigPath });

    expect(config.mcp.servers).toEqual([]);
  });

  describe('zero-config env var fallbacks', () => {
    it('auto-detects ANTHROPIC_API_KEY from env when no config file exists', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-auto-detect');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.anthropic.api_key).toBe('sk-ant-auto-detect');
    });

    it('auto-detects OPENAI_API_KEY from env when no config file exists', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai-auto');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.openai.api_key).toBe('sk-openai-auto');
    });

    it('auto-detects GEMINI_API_KEY from env when no config file exists', () => {
      vi.stubEnv('GEMINI_API_KEY', 'gemini-auto-detect');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.google.api_key).toBe('gemini-auto-detect');
    });

    it('auto-detects GOOGLE_API_KEY as fallback when GEMINI_API_KEY is not set', () => {
      vi.stubEnv('GOOGLE_API_KEY', 'google-fallback-key');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.google.api_key).toBe('google-fallback-key');
    });

    it('prefers GEMINI_API_KEY over GOOGLE_API_KEY', () => {
      vi.stubEnv('GEMINI_API_KEY', 'gemini-primary');
      vi.stubEnv('GOOGLE_API_KEY', 'google-secondary');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.google.api_key).toBe('gemini-primary');
    });

    it('auto-detects MINIMAX_API_KEY from env when no config file exists', () => {
      vi.stubEnv('MINIMAX_API_KEY', 'minimax-auto-detect');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.minimax.api_key).toBe('minimax-auto-detect');
    });

    it('auto-selects provider when only MINIMAX_API_KEY is set', () => {
      vi.stubEnv('MINIMAX_API_KEY', 'minimax-only-key');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.defaults.provider).toBe('minimax');
      expect(config.defaults.model).toBe('MiniMax-M2');
      expect(config.providers.minimax.api_key).toBe('minimax-only-key');
    });

    it('auto-selects provider when only OPENAI_API_KEY is set', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai-only');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.defaults.provider).toBe('openai');
      expect(config.defaults.model).toBe('gpt-4o');
    });

    it('auto-selects provider when only GEMINI_API_KEY is set', () => {
      vi.stubEnv('GEMINI_API_KEY', 'gemini-only');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.defaults.provider).toBe('google');
      expect(config.defaults.model).toBe('gemini-2.5-flash');
    });

    it('prefers anthropic when multiple keys are set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-multi');
      vi.stubEnv('MINIMAX_API_KEY', 'minimax-multi');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.defaults.provider).toBe('anthropic');
      expect(config.defaults.model).toBe('claude-sonnet-4-20250514');
    });

    it('keeps explicit provider from config even without its API key', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
defaults:
  provider: openai
  model: gpt-4o
`);
      vi.stubEnv('MINIMAX_API_KEY', 'minimax-fallback');

      const config = loadConfig({ configPath: testConfigPath });

      // Provider was explicitly set to openai but has no key, so auto-select kicks in
      expect(config.defaults.provider).toBe('minimax');
      expect(config.defaults.model).toBe('MiniMax-M2');
    });

    it('auto-detects both keys from env simultaneously', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-both');
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai-both');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.anthropic.api_key).toBe('sk-ant-both');
      expect(config.providers.openai.api_key).toBe('sk-openai-both');
    });

    it('does not override explicit config with env var', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
providers:
  anthropic:
    api_key: sk-explicit-key
`);
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-from-env');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.anthropic.api_key).toBe('sk-explicit-key');
    });

    it('falls back to env var when config has unresolved env ref', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
providers:
  anthropic:
    api_key: env:NONEXISTENT_VAR
`);
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fallback');

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.providers.anthropic.api_key).toBe('sk-ant-fallback');
    });
  });

  describe('loadConfigWithMeta', () => {
    it('reports configFileExists=false when no config file', () => {
      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.configFileExists).toBe(false);
    });

    it('reports configFileExists=true when config file exists', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `defaults:\n  provider: anthropic\n`);

      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.configFileExists).toBe(true);
    });

    it('reports envKeysUsed when env vars provide API keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-meta');

      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.envKeysUsed).toContain('ANTHROPIC_API_KEY');
      expect(result.config.providers.anthropic.api_key).toBe('sk-ant-meta');
    });

    it('reports envKeysUsed for GEMINI_API_KEY', () => {
      vi.stubEnv('GEMINI_API_KEY', 'gemini-meta');

      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.envKeysUsed).toContain('GEMINI_API_KEY');
      expect(result.config.providers.google.api_key).toBe('gemini-meta');
    });

    it('reports envKeysUsed for GOOGLE_API_KEY when GEMINI_API_KEY is not set', () => {
      vi.stubEnv('GOOGLE_API_KEY', 'google-meta');

      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.envKeysUsed).toContain('GOOGLE_API_KEY');
      expect(result.config.providers.google.api_key).toBe('google-meta');
    });

    it('reports envKeysUsed for MINIMAX_API_KEY', () => {
      vi.stubEnv('MINIMAX_API_KEY', 'minimax-meta');

      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.envKeysUsed).toContain('MINIMAX_API_KEY');
      expect(result.config.providers.minimax.api_key).toBe('minimax-meta');
    });

    it('does not report envKeysUsed when config already has the key', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
providers:
  anthropic:
    api_key: sk-explicit
`);
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-env');

      const result = loadConfigWithMeta({ configPath: testConfigPath });

      expect(result.envKeysUsed).not.toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('compaction config', () => {
    it('returns compaction defaults when no config file exists', () => {
      const config = loadConfig({ configPath: testConfigPath });

      expect(config.compaction.enabled).toBe(true);
      expect(config.compaction.auto_threshold).toBe(0.85);
      expect(config.compaction.preserve_turns).toBe(4);
      expect(config.compaction.model).toBe('claude-haiku-3-5-20241022');
    });

    it('merges custom compaction config', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
compaction:
  auto_threshold: 0.75
  preserve_turns: 6
`);

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.compaction.enabled).toBe(true); // default preserved
      expect(config.compaction.auto_threshold).toBe(0.75);
      expect(config.compaction.preserve_turns).toBe(6);
      expect(config.compaction.model).toBe('claude-haiku-3-5-20241022'); // default preserved
    });

    it('allows disabling compaction', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
compaction:
  enabled: false
`);

      const config = loadConfig({ configPath: testConfigPath });

      expect(config.compaction.enabled).toBe(false);
    });

    it('rejects invalid auto_threshold below 0.5', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
compaction:
  auto_threshold: 0.1
`);

      expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
    });

    it('rejects invalid auto_threshold above 0.95', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
compaction:
  auto_threshold: 0.99
`);

      expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
    });

    it('rejects non-integer preserve_turns', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
compaction:
  preserve_turns: 3.5
`);

      expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
    });
  });

  describe('session_budget_usd', () => {
    it('returns session_budget_usd default when not configured', () => {
      const config = loadConfig({ configPath: testConfigPath });
      expect(config.defaults.session_budget_usd).toBe(10.0);
    });

    it('merges custom session_budget_usd from config file', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
defaults:
  session_budget_usd: 25.0
`);

      const config = loadConfig({ configPath: testConfigPath });
      expect(config.defaults.session_budget_usd).toBe(25.0);
    });
  });

  describe('permissions', () => {
    it('returns empty permissions by default', () => {
      const config = loadConfig({ configPath: testConfigPath });
      expect(config.permissions).toEqual({});
    });

    it('merges permissions from config file', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
permissions:
  run_pipeline: confirm
  mcp.*: deny
`);

      const config = loadConfig({ configPath: testConfigPath });
      expect(config.permissions).toEqual({
        run_pipeline: 'confirm',
        'mcp.*': 'deny',
      });
    });

    it('rejects invalid permission level', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `
permissions:
  run_pipeline: invalid
`);

      expect(() => loadConfig({ configPath: testConfigPath })).toThrow(ConfigError);
    });
  });

  describe('setConfigValue', () => {
    it('sets a string config value', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `defaults:\n  provider: anthropic\n`);

      setConfigValue('defaults.provider', 'openai', { configPath: testConfigPath });

      const config = loadConfig({ configPath: testConfigPath });
      expect(config.defaults.provider).toBe('openai');
    });

    it('sets a numeric config value', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `defaults:\n  max_budget_usd: 5.0\n`);

      setConfigValue('defaults.max_budget_usd', '10.0', { configPath: testConfigPath });

      const config = loadConfig({ configPath: testConfigPath });
      expect(config.defaults.max_budget_usd).toBe(10.0);
    });

    it('creates nested keys when setting config value', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `defaults:\n  provider: anthropic\n`);

      setConfigValue('providers.anthropic.default_model', 'claude-opus-4-20250514', { configPath: testConfigPath });

      const config = loadConfig({ configPath: testConfigPath });
      expect(config.providers.anthropic.default_model).toBe('claude-opus-4-20250514');
    });

    it('rejects invalid values', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testConfigPath, `defaults:\n  provider: anthropic\n`);

      expect(() => setConfigValue('defaults.provider', 'invalid-provider', { configPath: testConfigPath })).toThrow(ConfigError);
    });

    it('throws when config file does not exist', () => {
      expect(() => setConfigValue('defaults.provider', 'openai', { configPath: '/nonexistent/path/config.yaml' })).toThrow(ConfigError);
    });
  });
});
