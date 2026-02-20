import { describe, it, expect } from 'vitest';
import type { Config } from '../../config/index.js';
import { buildSystemPrompt } from './system-prompt.js';

function makeConfig(): Config {
  return {
    defaults: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      max_budget_usd: 5.0,
      output_format: 'markdown',
      output_dir: './output',
    },
    skills_dir: '~/.scrutari/skills',
    providers: {
      anthropic: { api_key: 'sk-test', default_model: 'claude-sonnet-4-20250514' },
      openai: { api_key: undefined, default_model: 'gpt-4o' },
      google: { api_key: undefined, default_model: 'gemini-2.5-flash' },
    },
    mcp: { servers: [] },
  } as Config;
}

describe('buildSystemPrompt', () => {
  it('includes skill names in prompt', () => {
    const prompt = buildSystemPrompt(makeConfig(), ['deep-dive', 'comp-analysis']);
    expect(prompt).toContain('deep-dive');
    expect(prompt).toContain('comp-analysis');
  });

  it('shows (none found) when no skills', () => {
    const prompt = buildSystemPrompt(makeConfig(), []);
    expect(prompt).toContain('(none found)');
  });

  it('includes config values in prompt', () => {
    const prompt = buildSystemPrompt(makeConfig(), []);
    expect(prompt).toContain('anthropic');
    expect(prompt).toContain('claude-sonnet-4-20250514');
    expect(prompt).toContain('$5.00');
  });

  it('does not include MCP section when no MCP tools', () => {
    const prompt = buildSystemPrompt(makeConfig(), ['deep-dive']);
    expect(prompt).not.toContain('MCP Tools');
  });

  it('includes MCP tools section when MCP tools are provided', () => {
    const prompt = buildSystemPrompt(makeConfig(), ['deep-dive'], ['bloomberg/get_quote', 'bloomberg/get_news']);
    expect(prompt).toContain('MCP Tools');
    expect(prompt).toContain('bloomberg/get_quote');
    expect(prompt).toContain('bloomberg/get_news');
  });

  it('includes run_pipeline documentation', () => {
    const prompt = buildSystemPrompt(makeConfig(), []);
    expect(prompt).toContain('run_pipeline');
    expect(prompt).toContain('inputs');
    expect(prompt).toContain('list_skills');
  });
});
