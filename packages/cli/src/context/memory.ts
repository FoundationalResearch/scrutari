import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { UserMemory } from './types.js';

export const MEMORY_PATH = resolve(homedir(), '.scrutari', 'memory.json');
export const MAX_HISTORY_ENTRIES = 50;
export const MAX_TICKERS = 100;

export function createEmptyMemory(): UserMemory {
  return {
    frequent_tickers: [],
    analysis_history: [],
    preferred_depth: {},
    output_format_history: {},
    updated_at: Date.now(),
  };
}

export function loadMemory(): UserMemory {
  if (!existsSync(MEMORY_PATH)) {
    return createEmptyMemory();
  }

  try {
    const content = readFileSync(MEMORY_PATH, 'utf-8');
    const raw = JSON.parse(content);

    // Validate essential structure
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Array.isArray(raw.frequent_tickers) ||
      !Array.isArray(raw.analysis_history)
    ) {
      return createEmptyMemory();
    }

    return {
      frequent_tickers: raw.frequent_tickers,
      analysis_history: raw.analysis_history,
      preferred_depth: raw.preferred_depth ?? {},
      output_format_history: raw.output_format_history ?? {},
      updated_at: raw.updated_at ?? Date.now(),
    };
  } catch {
    return createEmptyMemory();
  }
}

export function saveMemory(memory: UserMemory): void {
  const dir = dirname(MEMORY_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');
}

export function recordTickerMention(memory: UserMemory, ticker: string): UserMemory {
  const normalized = ticker.toUpperCase();
  const tickers = [...memory.frequent_tickers];
  const existing = tickers.findIndex(t => t.ticker === normalized);

  if (existing >= 0) {
    tickers[existing] = {
      ...tickers[existing],
      count: tickers[existing].count + 1,
      last_used: Date.now(),
    };
  } else {
    tickers.push({ ticker: normalized, count: 1, last_used: Date.now() });
  }

  // Sort by count descending, cap at MAX_TICKERS
  tickers.sort((a, b) => b.count - a.count);
  const capped = tickers.slice(0, MAX_TICKERS);

  return { ...memory, frequent_tickers: capped, updated_at: Date.now() };
}

export function recordAnalysis(memory: UserMemory, skill: string, ticker: string): UserMemory {
  const history = [
    ...memory.analysis_history,
    { skill, ticker: ticker.toUpperCase(), timestamp: Date.now() },
  ];

  // Cap at MAX_HISTORY_ENTRIES (keep most recent)
  const capped = history.length > MAX_HISTORY_ENTRIES
    ? history.slice(history.length - MAX_HISTORY_ENTRIES)
    : history;

  return { ...memory, analysis_history: capped, updated_at: Date.now() };
}

export function recordDepthUsage(memory: UserMemory, depth: string): UserMemory {
  const preferred_depth = { ...memory.preferred_depth };
  preferred_depth[depth] = (preferred_depth[depth] ?? 0) + 1;
  return { ...memory, preferred_depth, updated_at: Date.now() };
}

export function recordFormatUsage(memory: UserMemory, format: string): UserMemory {
  const output_format_history = { ...memory.output_format_history };
  output_format_history[format] = (output_format_history[format] ?? 0) + 1;
  return { ...memory, output_format_history, updated_at: Date.now() };
}
