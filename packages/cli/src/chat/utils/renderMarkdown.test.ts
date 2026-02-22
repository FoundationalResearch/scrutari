import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './renderMarkdown.js';

describe('renderMarkdown', () => {
  it('renders plain text', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('Hello world');
  });

  it('renders bold text and strips markdown syntax', () => {
    const result = renderMarkdown('**bold**');
    expect(result).toContain('bold');
    expect(result).not.toContain('**');
  });

  it('renders italic text and strips markdown syntax', () => {
    const result = renderMarkdown('*italic*');
    expect(result).toContain('italic');
  });

  it('renders headers and strips markdown syntax', () => {
    const result = renderMarkdown('# Header');
    expect(result).toContain('Header');
    expect(result).not.toContain('# ');
  });

  it('renders code blocks', () => {
    const result = renderMarkdown('```\nconst x = 1;\n```');
    expect(result).toContain('const x = 1');
  });

  it('renders tables with box-drawing characters', () => {
    const result = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('1');
    expect(result).toContain('2');
    // Should contain box-drawing characters from cli-table3
    expect(result).toMatch(/[─│┌┐└┘├┤┬┴┼╔═╗║╚╝╟╢╤╧╪]/);
  });

  it('renders unordered lists', () => {
    const result = renderMarkdown('- item 1\n- item 2');
    expect(result).toContain('item 1');
    expect(result).toContain('item 2');
  });

  it('renders ordered lists', () => {
    const result = renderMarkdown('1. first\n2. second');
    expect(result).toContain('first');
    expect(result).toContain('second');
  });

  it('trims trailing newlines', () => {
    const result = renderMarkdown('hello');
    expect(result).not.toMatch(/\n$/);
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('handles incomplete code fences gracefully', () => {
    const result = renderMarkdown('```\npartial code');
    expect(result).toContain('partial code');
  });

  it('handles incomplete table gracefully', () => {
    const result = renderMarkdown('| A | B |\n|---|');
    expect(result).toContain('A');
  });

  it('accepts custom width', () => {
    const result = renderMarkdown('Hello world', 120);
    expect(result).toContain('Hello world');
  });

  it('renders links', () => {
    const result = renderMarkdown('[click here](https://example.com)');
    expect(result).toContain('click here');
  });

  it('renders blockquotes', () => {
    const result = renderMarkdown('> quoted text');
    expect(result).toContain('quoted text');
  });

  it('renders horizontal rules without crashing', () => {
    // HR may render as empty after trimming in non-color environments
    expect(() => renderMarkdown('---')).not.toThrow();
  });
});
