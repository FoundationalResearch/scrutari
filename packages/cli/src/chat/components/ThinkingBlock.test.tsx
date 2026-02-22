import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ThinkingBlock } from './ThinkingBlock.js';

describe('ThinkingBlock', () => {
  it('renders nothing for empty content', () => {
    const { lastFrame } = render(<ThinkingBlock content="" />);
    expect(lastFrame()).toBe('');
  });

  describe('collapsed (not streaming)', () => {
    it('shows collapsed summary with line count', () => {
      const { lastFrame } = render(<ThinkingBlock content="some thought" />);
      const output = lastFrame();
      expect(output).toContain('Thought');
      expect(output).toContain('1 line');
    });

    it('shows plural line count for multi-line content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const { lastFrame } = render(<ThinkingBlock content={content} />);
      const output = lastFrame();
      expect(output).toContain('3 lines');
    });

    it('does not show full thinking content', () => {
      const content = 'This is detailed reasoning\nwith multiple lines';
      const { lastFrame } = render(<ThinkingBlock content={content} />);
      const output = lastFrame();
      expect(output).not.toContain('This is detailed reasoning');
      expect(output).not.toContain('with multiple lines');
    });
  });

  describe('streaming', () => {
    it('shows last 4 lines when streaming and not verbose', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
      const { lastFrame } = render(<ThinkingBlock content={content} isStreaming />);
      const output = lastFrame();
      expect(output).toContain('Line 3');
      expect(output).toContain('Line 4');
      expect(output).toContain('Line 5');
      expect(output).toContain('Line 6');
      expect(output).not.toContain('Line 1');
      expect(output).not.toContain('Line 2');
    });

    it('shows truncation count for earlier lines', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
      const { lastFrame } = render(<ThinkingBlock content={content} isStreaming />);
      const output = lastFrame();
      expect(output).toContain('2 earlier lines');
    });

    it('shows all lines in verbose mode when streaming', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const { lastFrame } = render(<ThinkingBlock content={content} verbose isStreaming />);
      const output = lastFrame();
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
      expect(output).toContain('Line 4');
      expect(output).toContain('Line 5');
      expect(output).not.toContain('earlier lines');
    });

    it('shows all lines when 4 or fewer without truncation hint', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const { lastFrame } = render(<ThinkingBlock content={content} isStreaming />);
      const output = lastFrame();
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
      expect(output).not.toContain('earlier lines');
    });

    it('renders single-line content without truncation', () => {
      const { lastFrame } = render(<ThinkingBlock content="Just one line" isStreaming />);
      const output = lastFrame();
      expect(output).toContain('Just one line');
      expect(output).not.toContain('earlier lines');
    });
  });
});
