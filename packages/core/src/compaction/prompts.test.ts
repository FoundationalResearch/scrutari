import { describe, it, expect } from 'vitest';
import { buildCompactionPrompt } from './prompts.js';

describe('buildCompactionPrompt', () => {
  it('includes financial preservation rules', () => {
    const prompt = buildCompactionPrompt();
    expect(prompt).toContain('Ticker symbols');
    expect(prompt).toContain('Financial metrics');
    expect(prompt).toContain('revenue');
    expect(prompt).toContain('EPS');
    expect(prompt).toContain('P/E');
  });

  it('includes source citation preservation', () => {
    const prompt = buildCompactionPrompt();
    expect(prompt).toContain('SEC filing');
    expect(prompt).toContain('10-K');
    expect(prompt).toContain('Source citations');
  });

  it('includes output format with session summary header', () => {
    const prompt = buildCompactionPrompt();
    expect(prompt).toContain('## Session Summary (Compacted)');
    expect(prompt).toContain('### Active Analysis State');
  });

  it('includes must-drop rules', () => {
    const prompt = buildCompactionPrompt();
    expect(prompt).toContain('MUST DROP');
    expect(prompt).toContain('Greetings');
    expect(prompt).toContain('Intermediate reasoning steps');
  });

  it('appends user instructions when provided', () => {
    const prompt = buildCompactionPrompt('keep all NVDA metrics');
    expect(prompt).toContain('## Additional User Instructions');
    expect(prompt).toContain('keep all NVDA metrics');
  });

  it('omits user instructions section when not provided', () => {
    const prompt = buildCompactionPrompt();
    expect(prompt).not.toContain('## Additional User Instructions');
  });

  it('omits user instructions section for undefined', () => {
    const prompt = buildCompactionPrompt(undefined);
    expect(prompt).not.toContain('## Additional User Instructions');
  });
});
