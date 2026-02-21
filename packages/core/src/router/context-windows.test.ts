import { describe, it, expect } from 'vitest';
import { MODEL_CONTEXT_WINDOWS, getContextWindowSize } from './context-windows.js';

describe('MODEL_CONTEXT_WINDOWS', () => {
  it('contains entries for all listed models', () => {
    const expectedModels = [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-haiku-3-5-20241022',
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o1-mini',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'MiniMax-M2',
      'MiniMax-M2-Stable',
    ];
    for (const model of expectedModels) {
      expect(MODEL_CONTEXT_WINDOWS[model]).toBeDefined();
    }
  });

  it('all values are positive numbers', () => {
    for (const [model, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
    }
  });
});

describe('getContextWindowSize', () => {
  it('returns correct size for known Anthropic models', () => {
    expect(getContextWindowSize('claude-sonnet-4-20250514')).toBe(200_000);
    expect(getContextWindowSize('claude-haiku-3-5-20241022')).toBe(200_000);
  });

  it('returns correct size for known OpenAI models', () => {
    expect(getContextWindowSize('gpt-4o')).toBe(128_000);
    expect(getContextWindowSize('o1')).toBe(200_000);
  });

  it('returns correct size for known Gemini models', () => {
    expect(getContextWindowSize('gemini-2.5-pro')).toBe(1_000_000);
    expect(getContextWindowSize('gemini-2.0-flash')).toBe(1_000_000);
  });

  it('returns correct size for known MiniMax models', () => {
    expect(getContextWindowSize('MiniMax-M2')).toBe(1_000_000);
    expect(getContextWindowSize('MiniMax-M2-Stable')).toBe(1_000_000);
  });

  it('returns fallback for unknown models', () => {
    expect(getContextWindowSize('some-unknown-model')).toBe(128_000);
    expect(getContextWindowSize('')).toBe(128_000);
  });
});
