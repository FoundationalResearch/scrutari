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
    it('collapses to summary when not streaming', () => {
      const msg = makeMessage({
        content: 'Result',
        thinkingSegments: [{
          content: 'This is a long reasoning line\nAnd a second line\nAnd a third',
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
      expect(output).toContain('Thought');
      expect(output).toContain('3 lines');
      expect(output).not.toContain('This is a long reasoning line');
    });

    it('shows live content when streaming', () => {
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
      const { lastFrame } = render(<MessageBubble message={msg} isStreaming verbose />);
      const output = lastFrame();
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    it('shows singular line count for single-line thinking', () => {
      const msg = makeMessage({
        content: 'Result',
        thinkingSegments: [{
          content: 'Just one thought',
          toolCallId: 'tc-1',
        }],
        toolCalls: [{
          id: 'tc-1',
          name: 'get_quote',
          args: { ticker: 'NVDA' },
          status: 'done',
        }],
      });
      const { lastFrame } = render(<MessageBubble message={msg} />);
      const output = lastFrame();
      expect(output).toContain('1 line');
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
