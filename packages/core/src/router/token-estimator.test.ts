import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from './token-estimator.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for undefined-like input', () => {
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it('estimates short text', () => {
    // "Hello" = 5 chars / 3.5 ≈ 1.43 → ceil = 2
    expect(estimateTokens('Hello')).toBe(2);
  });

  it('estimates longer text', () => {
    const text = 'a'.repeat(350); // 350 / 3.5 = 100
    expect(estimateTokens(text)).toBe(100);
  });

  it('rounds up fractional tokens', () => {
    const text = 'a'.repeat(10); // 10 / 3.5 = 2.857 → 3
    expect(estimateTokens(text)).toBe(3);
  });
});

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty messages with no system prompt', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('counts system prompt tokens', () => {
    const result = estimateMessagesTokens([], 'You are a helpful assistant.');
    // 28 chars / 3.5 = 8, + 4 overhead = 12
    expect(result).toBe(12);
  });

  it('counts message tokens with per-message overhead', () => {
    const messages = [
      { role: 'user', content: 'Hello' },      // 2 + 4 = 6
      { role: 'assistant', content: 'Hi there' }, // 3 + 4 = 7
    ];
    expect(estimateMessagesTokens(messages)).toBe(13);
  });

  it('counts system prompt plus messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
    ];
    const result = estimateMessagesTokens(messages, 'System');
    // System: ceil(6/3.5) + 4 = 2 + 4 = 6
    // User: ceil(5/3.5) + 4 = 2 + 4 = 6
    expect(result).toBe(12);
  });

  it('handles messages with empty content', () => {
    const messages = [
      { role: 'user', content: '' },
    ];
    // 0 tokens + 4 overhead = 4
    expect(estimateMessagesTokens(messages)).toBe(4);
  });

  it('handles very long content', () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(100_000) },
    ];
    const result = estimateMessagesTokens(messages);
    // 100000 / 3.5 = 28571.43 → 28572 + 4 = 28576
    expect(result).toBe(28_576);
  });
});
