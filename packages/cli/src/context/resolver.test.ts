import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveContext } from './resolver.js';

vi.mock('./instructions.js', () => ({
  loadInstructions: vi.fn(),
}));

vi.mock('./preferences.js', () => ({
  loadPreferences: vi.fn(),
}));

vi.mock('./rules.js', () => ({
  loadAllRules: vi.fn(),
}));

vi.mock('./personas.js', () => ({
  loadAllPersonas: vi.fn(),
  findPersona: vi.fn(),
}));

vi.mock('./memory.js', () => ({
  loadMemory: vi.fn(),
}));

import { loadInstructions } from './instructions.js';
import { loadPreferences } from './preferences.js';
import { loadAllRules } from './rules.js';
import { loadAllPersonas, findPersona } from './personas.js';
import { loadMemory } from './memory.js';

const mockLoadInstructions = vi.mocked(loadInstructions);
const mockLoadPreferences = vi.mocked(loadPreferences);
const mockLoadAllRules = vi.mocked(loadAllRules);
const mockLoadAllPersonas = vi.mocked(loadAllPersonas);
const mockFindPersona = vi.mocked(findPersona);
const mockLoadMemory = vi.mocked(loadMemory);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadInstructions.mockReturnValue({ global: undefined, project: undefined });
  mockLoadPreferences.mockReturnValue({
    analysis_depth: 'standard',
    favorite_tickers: [],
    favorite_sectors: [],
    watchlists: {},
    risk_framing: 'moderate',
  });
  mockLoadAllRules.mockReturnValue([]);
  mockLoadAllPersonas.mockReturnValue([
    {
      persona: { name: 'equity-analyst', description: 'Test', system_prompt: 'Prompt' },
      filePath: '<built-in>',
      source: 'built-in',
    },
  ]);
  mockFindPersona.mockReturnValue(undefined);
  mockLoadMemory.mockReturnValue({
    frequent_tickers: [],
    analysis_history: [],
    preferred_depth: {},
    output_format_history: {},
    updated_at: 1000,
  });
});

describe('resolveContext', () => {
  it('assembles a ContextBundle from all loaders', () => {
    const result = resolveContext({ cwd: '/project' });
    expect(result.instructions).toBeDefined();
    expect(result.preferences).toBeDefined();
    expect(result.rules).toBeDefined();
    expect(result.availablePersonas).toEqual(['equity-analyst']);
    expect(result.activePersona).toBeUndefined();
  });

  it('passes cwd to instructions and rules loaders', () => {
    resolveContext({ cwd: '/my/project' });
    expect(mockLoadInstructions).toHaveBeenCalledWith('/my/project');
    expect(mockLoadAllRules).toHaveBeenCalledWith('/my/project');
  });

  it('uses personaOverride over preferences.default_persona', () => {
    mockLoadPreferences.mockReturnValue({
      analysis_depth: 'standard',
      favorite_tickers: [],
      favorite_sectors: [],
      watchlists: {},
      risk_framing: 'moderate',
      default_persona: 'portfolio-manager',
    });

    resolveContext({ cwd: '/project', personaOverride: 'quant-screen' });
    expect(mockFindPersona).toHaveBeenCalledWith('quant-screen', expect.any(Array));
  });

  it('falls back to preferences.default_persona when no override', () => {
    mockLoadPreferences.mockReturnValue({
      analysis_depth: 'standard',
      favorite_tickers: [],
      favorite_sectors: [],
      watchlists: {},
      risk_framing: 'moderate',
      default_persona: 'pm-brief',
    });

    resolveContext({ cwd: '/project' });
    expect(mockFindPersona).toHaveBeenCalledWith('pm-brief', expect.any(Array));
  });

  it('sets activePersona when found', () => {
    const persona = {
      persona: { name: 'equity-analyst', description: 'Test', system_prompt: 'Prompt' },
      filePath: '<built-in>' as const,
      source: 'built-in' as const,
    };
    mockFindPersona.mockReturnValue(persona);
    mockLoadPreferences.mockReturnValue({
      analysis_depth: 'standard',
      favorite_tickers: [],
      favorite_sectors: [],
      watchlists: {},
      risk_framing: 'moderate',
      default_persona: 'equity-analyst',
    });

    const result = resolveContext({ cwd: '/project' });
    expect(result.activePersona).toBe(persona);
  });

  it('does not call findPersona when no persona name', () => {
    resolveContext({ cwd: '/project' });
    expect(mockFindPersona).not.toHaveBeenCalled();
  });

  it('includes memory in the bundle', () => {
    const memory = {
      frequent_tickers: [{ ticker: 'AAPL', count: 5, last_used: 1000 }],
      analysis_history: [],
      preferred_depth: {},
      output_format_history: {},
      updated_at: 1000,
    };
    mockLoadMemory.mockReturnValue(memory);

    const result = resolveContext({ cwd: '/project' });
    expect(result.memory).toBe(memory);
  });
});
