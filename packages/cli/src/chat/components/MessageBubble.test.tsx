import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MessageBubble } from './MessageBubble.js';
import type { ChatMessage } from '../types.js';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'test-id',
    role: 'assistant',
    content: 'Hello, world!',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('MessageBubble', () => {
  it('renders user message with prompt marker', () => {
    const msg = makeMessage({ role: 'user', content: 'analyze NVDA' });
    const { lastFrame } = render(<MessageBubble message={msg} />);
    const output = lastFrame();
    expect(output).toContain('analyze NVDA');
  });

  it('renders system message in dim italic', () => {
    const msg = makeMessage({ role: 'system', content: 'Plan mode enabled.' });
    const { lastFrame } = render(<MessageBubble message={msg} />);
    expect(lastFrame()).toContain('Plan mode enabled.');
  });

  it('renders assistant message content', () => {
    const msg = makeMessage({ content: 'Here is the analysis...' });
    const { lastFrame } = render(<MessageBubble message={msg} />);
    expect(lastFrame()).toContain('Here is the analysis...');
  });

  it('shows streaming cursor when isStreaming', () => {
    const msg = makeMessage({ content: 'Partial text' });
    const { lastFrame } = render(<MessageBubble message={msg} isStreaming />);
    // The block cursor character
    expect(lastFrame()).toContain('\u2588');
  });

  it('shows thinking spinner when streaming with no content', () => {
    const msg = makeMessage({ content: '' });
    const { lastFrame } = render(<MessageBubble message={msg} isStreaming />);
    expect(lastFrame()).toContain('Thinking...');
  });

  describe('inline thinking', () => {
    it('shows one-line summary when not verbose', () => {
      const msg = makeMessage({
        content: 'Result',
        thinkingSegments: [{
          content: 'This is a long reasoning line that should be truncated\nAnd a second line\nAnd a third',
          toolCallId: 'tc-1',
        }],
        toolCalls: [{
          id: 'tc-1',
          name: 'get_quote',
          args: { ticker: 'NVDA' },
          status: 'done',
        }],
      });
      const { lastFrame } = render(<MessageBubble message={msg} verbose={false} />);
      const output = lastFrame();
      // Should show first line (possibly truncated) but not second/third
      expect(output).toContain('This is a long reasoning');
      expect(output).not.toContain('And a second line');
      expect(output).not.toContain('And a third');
    });

    it('shows all lines when verbose', () => {
      const msg = makeMessage({
        content: 'Result',
        thinkingSegments: [{
          content: 'Line 1\nLine 2\nLine 3',
          toolCallId: 'tc-1',
        }],
        toolCalls: [{
          id: 'tc-1',
          name: 'get_quote',
          args: { ticker: 'NVDA' },
          status: 'done',
        }],
      });
      const { lastFrame } = render(<MessageBubble message={msg} verbose />);
      const output = lastFrame();
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    it('truncates first line to 80 chars when not verbose', () => {
      const longLine = 'A'.repeat(100);
      const msg = makeMessage({
        content: 'Result',
        thinkingSegments: [{
          content: longLine,
          toolCallId: 'tc-1',
        }],
        toolCalls: [{
          id: 'tc-1',
          name: 'get_quote',
          args: { ticker: 'NVDA' },
          status: 'done',
        }],
      });
      const { lastFrame } = render(<MessageBubble message={msg} verbose={false} />);
      const output = lastFrame();
      // Should contain truncated text with ...
      expect(output).toContain('...');
      // Should not contain the full 100-char line
      expect(output).not.toContain(longLine);
    });
  });

  describe('tool call status', () => {
    it('renders done tool calls with checkmark', () => {
      const msg = makeMessage({
        content: 'Done',
        toolCalls: [{
          id: 'tc-1',
          name: 'get_quote',
          args: { ticker: 'NVDA' },
          status: 'done',
        }],
      });
      const { lastFrame } = render(<MessageBubble message={msg} />);
      expect(lastFrame()).toContain('get_quote');
      expect(lastFrame()).toContain('\u2713');
    });

    it('renders error tool calls with X', () => {
      const msg = makeMessage({
        content: 'Error occurred',
        toolCalls: [{
          id: 'tc-1',
          name: 'search_filings',
          args: {},
          status: 'error',
        }],
      });
      const { lastFrame } = render(<MessageBubble message={msg} />);
      expect(lastFrame()).toContain('search_filings');
      expect(lastFrame()).toContain('\u2717');
    });
  });
});
