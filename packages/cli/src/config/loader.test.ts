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

  it('appends MCP servers to defaults', () => {
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
