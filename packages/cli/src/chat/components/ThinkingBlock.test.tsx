import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ThinkingBlock } from './ThinkingBlock.js';

describe('ThinkingBlock', () => {
  it('renders nothing for empty content', () => {
    const { lastFrame } = render(<ThinkingBlock content="" />);
    // Empty Box renders as empty string
    expect(lastFrame()).toBe('');
  });

  it('renders Reasoning header', () => {
    const { lastFrame } = render(<ThinkingBlock content="some thought" />);
    expect(lastFrame()).toContain('Reasoning:');
  });

  it('shows first 2 lines when not verbose', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4';
    const { lastFrame } = render(<ThinkingBlock content={content} />);
    const output = lastFrame();
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).not.toContain('Line 3');
    expect(output).not.toContain('Line 4');
  });

  it('shows truncation hint with --verbose in non-verbose mode', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4';
    const { lastFrame } = render(<ThinkingBlock content={content} />);
    const output = lastFrame();
    expect(output).toContain('2 more lines');
    expect(output).toContain('--verbose');
  });

  it('shows all lines in verbose mode', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4';
    const { lastFrame } = render(<ThinkingBlock content={content} verbose />);
    const output = lastFrame();
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).toContain('Line 3');
    expect(output).toContain('Line 4');
    expect(output).not.toContain('more lines');
  });

  it('does not show truncation hint when content fits in 2 lines', () => {
    const content = 'Line 1\nLine 2';
    const { lastFrame } = render(<ThinkingBlock content={content} />);
    expect(lastFrame()).not.toContain('more lines');
  });

  it('renders single-line content without truncation', () => {
    const { lastFrame } = render(<ThinkingBlock content="Just one line" />);
    const output = lastFrame();
    expect(output).toContain('Just one line');
    expect(output).not.toContain('more lines');
  });
});
