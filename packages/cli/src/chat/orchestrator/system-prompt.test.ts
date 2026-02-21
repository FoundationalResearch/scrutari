import { describe, it, expect } from 'vitest';
import type { Config } from '../../config/index.js';
import type { ContextBundle } from '../../context/types.js';
import { buildSystemPrompt } from './system-prompt.js';

function makeConfig(): Config {
  return {
    defaults: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      max_budget_usd: 5.0,
      approval_threshold_usd: 1.0,
      session_budget_usd: 10.0,
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
    agents: { research: {}, explore: {}, verify: {}, default: {} },
    compaction: { enabled: true, auto_threshold: 0.85, preserve_turns: 4, model: 'claude-haiku-3-5-20241022' },
    permissions: {},
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

  it('includes plan mode section when planMode is true', () => {
    const prompt = buildSystemPrompt(makeConfig(), [], [], { planMode: true });
    expect(prompt).toContain('Plan Mode (ACTIVE)');
    expect(prompt).toContain('preview_pipeline');
    expect(prompt).toContain('Blocked');
    expect(prompt).toContain('run_pipeline');
  });

  it('does not include plan mode section when planMode is false', () => {
    const prompt = buildSystemPrompt(makeConfig(), [], [], { planMode: false });
    expect(prompt).not.toContain('Plan Mode (ACTIVE)');
  });

  it('does not include plan mode section when options omitted', () => {
    const prompt = buildSystemPrompt(makeConfig(), []);
    expect(prompt).not.toContain('Plan Mode (ACTIVE)');
  });

  it('includes read-only mode section when readOnly is true', () => {
    const prompt = buildSystemPrompt(makeConfig(), [], [], { readOnly: true });
    expect(prompt).toContain('Read-Only Mode (ACTIVE)');
    expect(prompt).toContain('get_quote');
    expect(prompt).toContain('search_filings');
    expect(prompt).toContain('search_news');
    expect(prompt).toContain('Pipeline execution (run_pipeline) and config changes are not available');
  });

  it('does not include read-only section when readOnly is false', () => {
    const prompt = buildSystemPrompt(makeConfig(), [], [], { readOnly: false });
    expect(prompt).not.toContain('Read-Only Mode (ACTIVE)');
  });

  it('does not include read-only section when options omitted', () => {
    const prompt = buildSystemPrompt(makeConfig(), []);
    expect(prompt).not.toContain('Read-Only Mode (ACTIVE)');
  });

  describe('with contextBundle', () => {
    function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
      return {
        instructions: {},
        preferences: {
          analysis_depth: 'standard',
          favorite_tickers: [],
          favorite_sectors: [],
          watchlists: {},
          risk_framing: 'moderate',
        },
        rules: [],
        availablePersonas: [],
        ...overrides,
      };
    }

    it('includes active persona section', () => {
      const bundle = makeBundle({
        activePersona: {
          persona: {
            name: 'equity-analyst',
            description: 'Test',
            system_prompt: 'You are a senior analyst',
            tone: 'formal and data-driven',
          },
          filePath: '<built-in>',
          source: 'built-in',
        },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Active Persona: equity-analyst');
      expect(prompt).toContain('You are a senior analyst');
      expect(prompt).toContain('Tone: formal and data-driven');
    });

    it('includes user preferences', () => {
      const bundle = makeBundle({
        preferences: {
          analysis_depth: 'deep',
          favorite_tickers: ['AAPL', 'NVDA'],
          favorite_sectors: ['technology'],
          watchlists: { tech: ['AAPL', 'MSFT'] },
          risk_framing: 'conservative',
          output_format: 'markdown',
          custom_instructions: 'Always include ESG analysis',
        },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Analysis depth: deep');
      expect(prompt).toContain('Favorite tickers: AAPL, NVDA');
      expect(prompt).toContain('Favorite sectors: technology');
      expect(prompt).toContain('Watchlist "tech": AAPL, MSFT');
      expect(prompt).toContain('Risk framing: conservative');
      expect(prompt).toContain('Preferred output format: markdown');
      expect(prompt).toContain('Always include ESG analysis');
    });

    it('includes global instructions', () => {
      const bundle = makeBundle({
        instructions: { global: 'Always be thorough in analysis' },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Global Instructions');
      expect(prompt).toContain('Always be thorough in analysis');
    });

    it('includes project instructions', () => {
      const bundle = makeBundle({
        instructions: { project: 'Focus on healthcare sector' },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Project Instructions');
      expect(prompt).toContain('Focus on healthcare sector');
    });

    it('includes session instructions', () => {
      const bundle = makeBundle({
        instructions: { session: 'Comparing Q3 earnings only' },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Session Instructions');
      expect(prompt).toContain('Comparing Q3 earnings only');
    });

    it('includes universal analysis rules', () => {
      const bundle = makeBundle({
        rules: [
          {
            rule: { name: 'always-cite', instruction: 'Always cite SEC filings', priority: 50 },
            filePath: '/test.yaml',
            source: 'global',
          },
        ],
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Analysis Rules');
      expect(prompt).toContain('always-cite');
      expect(prompt).toContain('Always cite SEC filings');
    });

    it('excludes conditional rules from system prompt', () => {
      const bundle = makeBundle({
        rules: [
          {
            rule: { name: 'apple-rule', instruction: 'Focus on services', priority: 50, match: { ticker: 'AAPL' } },
            filePath: '/test.yaml',
            source: 'global',
          },
        ],
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).not.toContain('Analysis Rules');
      expect(prompt).not.toContain('apple-rule');
    });

    it('includes local instructions', () => {
      const bundle = makeBundle({
        instructions: { local: 'Override settings for local dev' },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('Local Instructions');
      expect(prompt).toContain('Override settings for local dev');
    });

    it('includes user history from memory', () => {
      const bundle = makeBundle({
        memory: {
          frequent_tickers: [
            { ticker: 'AAPL', count: 10, last_used: 1000 },
            { ticker: 'NVDA', count: 5, last_used: 900 },
          ],
          analysis_history: [
            { skill: 'deep-dive', ticker: 'AAPL', timestamp: 1706745600000 },
          ],
          preferred_depth: { deep: 5, standard: 2 },
          output_format_history: { markdown: 3 },
          updated_at: 1000,
        },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).toContain('User History');
      expect(prompt).toContain('AAPL (10 times)');
      expect(prompt).toContain('NVDA (5 times)');
      expect(prompt).toContain('deep-dive on AAPL');
      expect(prompt).toContain('Most used analysis depth: deep');
      expect(prompt).toContain('Most used output format: markdown');
    });

    it('does not include user history when memory is empty', () => {
      const bundle = makeBundle({
        memory: {
          frequent_tickers: [],
          analysis_history: [],
          preferred_depth: {},
          output_format_history: {},
          updated_at: 1000,
        },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      expect(prompt).not.toContain('User History');
    });

    it('does not add context sections when no contextBundle', () => {
      const prompt = buildSystemPrompt(makeConfig(), []);
      expect(prompt).not.toContain('Active Persona');
      expect(prompt).not.toContain('User Preferences');
      expect(prompt).not.toContain('Global Instructions');
    });

    it('context sections appear between Configuration and Guidelines', () => {
      const bundle = makeBundle({
        instructions: { global: 'GLOBAL_MARKER' },
      });

      const prompt = buildSystemPrompt(makeConfig(), [], [], { contextBundle: bundle });
      const configIdx = prompt.indexOf('## Configuration');
      const globalIdx = prompt.indexOf('GLOBAL_MARKER');
      const guidelinesIdx = prompt.indexOf('## Guidelines');

      expect(configIdx).toBeLessThan(globalIdx);
      expect(globalIdx).toBeLessThan(guidelinesIdx);
    });
  });
});
