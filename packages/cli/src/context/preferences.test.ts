import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPreferences, PREFERENCES_DEFAULTS, PreferencesLoadError } from './preferences.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { readFileSync, existsSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadPreferences', () => {
  it('returns defaults when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadPreferences();
    expect(result).toEqual(PREFERENCES_DEFAULTS);
  });

  it('loads and parses valid preferences', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
analysis_depth: deep
favorite_tickers:
  - AAPL
  - NVDA
risk_framing: conservative
`);

    const result = loadPreferences();
    expect(result.analysis_depth).toBe('deep');
    expect(result.favorite_tickers).toEqual(['AAPL', 'NVDA']);
    expect(result.risk_framing).toBe('conservative');
    expect(result.watchlists).toEqual({});
  });

  it('applies defaults for missing fields', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
favorite_tickers:
  - TSLA
`);

    const result = loadPreferences();
    expect(result.analysis_depth).toBe('standard');
    expect(result.risk_framing).toBe('moderate');
    expect(result.favorite_tickers).toEqual(['TSLA']);
  });

  it('loads watchlists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
watchlists:
  tech: [AAPL, MSFT, GOOG]
  energy: [XOM, CVX]
`);

    const result = loadPreferences();
    expect(result.watchlists).toEqual({
      tech: ['AAPL', 'MSFT', 'GOOG'],
      energy: ['XOM', 'CVX'],
    });
  });

  it('loads default_persona', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
default_persona: investment-analyst
`);

    const result = loadPreferences();
    expect(result.default_persona).toBe('investment-analyst');
  });

  it('loads custom_instructions', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
custom_instructions: Always include ESG analysis
`);

    const result = loadPreferences();
    expect(result.custom_instructions).toBe('Always include ESG analysis');
  });

  it('returns defaults for empty file (null YAML)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');

    const result = loadPreferences();
    expect(result).toEqual(PREFERENCES_DEFAULTS);
  });

  it('throws PreferencesLoadError for invalid YAML syntax', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{{{{invalid yaml');

    expect(() => loadPreferences()).toThrow(PreferencesLoadError);
  });

  it('throws PreferencesLoadError for invalid schema values', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
analysis_depth: ultra-mega-deep
`);

    expect(() => loadPreferences()).toThrow(PreferencesLoadError);
    expect(() => loadPreferences()).toThrow('Invalid preferences');
  });

  it('throws PreferencesLoadError for wrong types', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
favorite_tickers: "not-an-array"
`);

    expect(() => loadPreferences()).toThrow(PreferencesLoadError);
  });
});
