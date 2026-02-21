import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadMemory,
  saveMemory,
  recordTickerMention,
  recordAnalysis,
  recordDepthUsage,
  recordFormatUsage,
  createEmptyMemory,
  MAX_HISTORY_ENTRIES,
  MAX_TICKERS,
} from './memory.js';
import type { UserMemory } from './types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadMemory', () => {
  it('returns empty memory when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadMemory();
    expect(result.frequent_tickers).toEqual([]);
    expect(result.analysis_history).toEqual([]);
    expect(result.preferred_depth).toEqual({});
    expect(result.output_format_history).toEqual({});
  });

  it('loads valid memory from file', () => {
    const stored: UserMemory = {
      frequent_tickers: [{ ticker: 'AAPL', count: 5, last_used: 1000 }],
      analysis_history: [{ skill: 'deep-dive', ticker: 'AAPL', timestamp: 1000 }],
      preferred_depth: { deep: 3 },
      output_format_history: { markdown: 2 },
      updated_at: 1000,
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(stored));

    const result = loadMemory();
    expect(result.frequent_tickers).toHaveLength(1);
    expect(result.frequent_tickers[0].ticker).toBe('AAPL');
    expect(result.analysis_history).toHaveLength(1);
    expect(result.preferred_depth).toEqual({ deep: 3 });
  });

  it('returns empty memory for corrupt JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json {{{');

    const result = loadMemory();
    expect(result.frequent_tickers).toEqual([]);
    expect(result.analysis_history).toEqual([]);
  });

  it('returns empty memory for invalid structure', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ foo: 'bar' }));

    const result = loadMemory();
    expect(result.frequent_tickers).toEqual([]);
  });

  it('handles missing optional fields gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      frequent_tickers: [],
      analysis_history: [],
    }));

    const result = loadMemory();
    expect(result.preferred_depth).toEqual({});
    expect(result.output_format_history).toEqual({});
  });
});

describe('saveMemory', () => {
  it('writes memory as JSON', () => {
    mockExistsSync.mockReturnValue(true);
    const memory = createEmptyMemory();

    saveMemory(memory);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('memory.json'),
      expect.any(String),
      'utf-8',
    );
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.frequent_tickers).toEqual([]);
  });
});

describe('recordTickerMention', () => {
  it('adds a new ticker', () => {
    const memory = createEmptyMemory();
    const result = recordTickerMention(memory, 'AAPL');

    expect(result.frequent_tickers).toHaveLength(1);
    expect(result.frequent_tickers[0].ticker).toBe('AAPL');
    expect(result.frequent_tickers[0].count).toBe(1);
  });

  it('increments count for existing ticker', () => {
    const memory: UserMemory = {
      ...createEmptyMemory(),
      frequent_tickers: [{ ticker: 'AAPL', count: 3, last_used: 1000 }],
    };
    const result = recordTickerMention(memory, 'AAPL');

    expect(result.frequent_tickers).toHaveLength(1);
    expect(result.frequent_tickers[0].count).toBe(4);
  });

  it('normalizes ticker to uppercase', () => {
    const memory = createEmptyMemory();
    const result = recordTickerMention(memory, 'aapl');

    expect(result.frequent_tickers[0].ticker).toBe('AAPL');
  });

  it('caps at MAX_TICKERS', () => {
    const tickers = Array.from({ length: MAX_TICKERS }, (_, i) => ({
      ticker: `T${String(i).padStart(4, '0')}`,
      count: MAX_TICKERS - i,
      last_used: 1000,
    }));
    const memory: UserMemory = { ...createEmptyMemory(), frequent_tickers: tickers };

    const result = recordTickerMention(memory, 'NEWT');
    expect(result.frequent_tickers).toHaveLength(MAX_TICKERS);
  });

  it('does not mutate original memory', () => {
    const memory = createEmptyMemory();
    const result = recordTickerMention(memory, 'AAPL');

    expect(memory.frequent_tickers).toHaveLength(0);
    expect(result.frequent_tickers).toHaveLength(1);
  });
});

describe('recordAnalysis', () => {
  it('appends analysis entry', () => {
    const memory = createEmptyMemory();
    const result = recordAnalysis(memory, 'deep-dive', 'NVDA');

    expect(result.analysis_history).toHaveLength(1);
    expect(result.analysis_history[0].skill).toBe('deep-dive');
    expect(result.analysis_history[0].ticker).toBe('NVDA');
  });

  it('caps at MAX_HISTORY_ENTRIES keeping most recent', () => {
    const history = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => ({
      skill: 'deep-dive',
      ticker: 'AAPL',
      timestamp: i,
    }));
    const memory: UserMemory = { ...createEmptyMemory(), analysis_history: history };

    const result = recordAnalysis(memory, 'comp-analysis', 'NVDA');
    expect(result.analysis_history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(result.analysis_history[MAX_HISTORY_ENTRIES - 1].skill).toBe('comp-analysis');
    expect(result.analysis_history[0].timestamp).toBe(1); // oldest entry (0) was dropped
  });

  it('normalizes ticker to uppercase', () => {
    const memory = createEmptyMemory();
    const result = recordAnalysis(memory, 'deep-dive', 'nvda');

    expect(result.analysis_history[0].ticker).toBe('NVDA');
  });
});

describe('recordDepthUsage', () => {
  it('increments depth counter', () => {
    const memory = createEmptyMemory();
    const r1 = recordDepthUsage(memory, 'deep');
    const r2 = recordDepthUsage(r1, 'deep');
    const r3 = recordDepthUsage(r2, 'standard');

    expect(r3.preferred_depth).toEqual({ deep: 2, standard: 1 });
  });

  it('does not mutate original memory', () => {
    const memory = createEmptyMemory();
    recordDepthUsage(memory, 'deep');

    expect(memory.preferred_depth).toEqual({});
  });
});

describe('recordFormatUsage', () => {
  it('increments format counter', () => {
    const memory = createEmptyMemory();
    const r1 = recordFormatUsage(memory, 'markdown');
    const r2 = recordFormatUsage(r1, 'json');
    const r3 = recordFormatUsage(r2, 'markdown');

    expect(r3.output_format_history).toEqual({ markdown: 2, json: 1 });
  });
});
