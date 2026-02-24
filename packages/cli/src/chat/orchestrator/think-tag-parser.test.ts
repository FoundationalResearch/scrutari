import { describe, it, expect, vi } from 'vitest';
import { ThinkTagParser } from './think-tag-parser.js';

function createParser() {
  const onText = vi.fn();
  const onThinking = vi.fn();
  const parser = new ThinkTagParser(onText, onThinking);
  return { parser, onText, onThinking };
}

function collectCalls(fn: ReturnType<typeof vi.fn>): string {
  return fn.mock.calls.map((c: string[]) => c[0]).join('');
}

describe('ThinkTagParser', () => {
  describe('no think tags', () => {
    it('passes plain text through to onText', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('Hello world');
      parser.end();
      expect(collectCalls(onText)).toBe('Hello world');
      expect(onThinking).not.toHaveBeenCalled();
    });

    it('handles multiple chunks without tags', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('Hello ');
      parser.push('world');
      parser.end();
      expect(collectCalls(onText)).toBe('Hello world');
      expect(onThinking).not.toHaveBeenCalled();
    });
  });

  describe('basic extraction', () => {
    it('extracts thinking from a single chunk', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think>reasoning here</think>response text');
      parser.end();
      expect(collectCalls(onThinking)).toBe('reasoning here');
      expect(collectCalls(onText)).toBe('response text');
    });

    it('handles think block at start with newlines', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think>\nreasoning\n</think>\n\nResponse');
      parser.end();
      expect(collectCalls(onThinking)).toBe('reasoning\n');
      expect(collectCalls(onText)).toBe('Response');
    });

    it('handles think block with no content after', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think>just thinking</think>');
      parser.end();
      expect(collectCalls(onThinking)).toBe('just thinking');
      expect(onText).not.toHaveBeenCalled();
    });

    it('handles text before think block', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('prefix <think>reasoning</think>suffix');
      parser.end();
      expect(collectCalls(onText)).toBe('prefix suffix');
      expect(collectCalls(onThinking)).toBe('reasoning');
    });
  });

  describe('tags split across chunks', () => {
    it('handles <think> split across chunks', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<thi');
      parser.push('nk>reasoning</think>response');
      parser.end();
      expect(collectCalls(onThinking)).toBe('reasoning');
      expect(collectCalls(onText)).toBe('response');
    });

    it('handles </think> split across chunks', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think>reasoning</thi');
      parser.push('nk>response');
      parser.end();
      expect(collectCalls(onThinking)).toBe('reasoning');
      expect(collectCalls(onText)).toBe('response');
    });

    it('handles tag split at every position', () => {
      const tag = '<think>';
      for (let i = 1; i < tag.length; i++) {
        const { parser, onText, onThinking } = createParser();
        parser.push(tag.slice(0, i));
        parser.push(tag.slice(i) + 'reasoning</think>text');
        parser.end();
        expect(collectCalls(onThinking)).toBe('reasoning');
        expect(collectCalls(onText)).toBe('text');
      }
    });

    it('handles close tag split at every position', () => {
      const tag = '</think>';
      for (let i = 1; i < tag.length; i++) {
        const { parser, onText, onThinking } = createParser();
        parser.push('<think>reasoning' + tag.slice(0, i));
        parser.push(tag.slice(i) + 'text');
        parser.end();
        expect(collectCalls(onThinking)).toBe('reasoning');
        expect(collectCalls(onText)).toBe('text');
      }
    });

    it('handles single-character chunks', () => {
      const { parser, onText, onThinking } = createParser();
      const input = '<think>hi</think>ok';
      for (const ch of input) {
        parser.push(ch);
      }
      parser.end();
      expect(collectCalls(onThinking)).toBe('hi');
      expect(collectCalls(onText)).toBe('ok');
    });
  });

  describe('multiple think blocks', () => {
    it('handles two think blocks', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think>first</think>middle<think>second</think>end');
      parser.end();
      expect(collectCalls(onThinking)).toBe('firstsecond');
      expect(collectCalls(onText)).toBe('middleend');
    });
  });

  describe('unclosed think tags', () => {
    it('flushes remaining thinking on end()', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think>unclosed reasoning');
      parser.end();
      expect(collectCalls(onThinking)).toBe('unclosed reasoning');
      expect(onText).not.toHaveBeenCalled();
    });
  });

  describe('partial tag that turns out to not be a tag', () => {
    it('handles < in text that is not a think tag', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('a < b');
      parser.end();
      expect(collectCalls(onText)).toBe('a < b');
      expect(onThinking).not.toHaveBeenCalled();
    });

    it('handles <t in text that is not a think tag', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<t');
      parser.push('able>data</table>');
      parser.end();
      expect(collectCalls(onText)).toBe('<table>data</table>');
      expect(onThinking).not.toHaveBeenCalled();
    });

    it('flushes partial tag buffer on end() when not a tag', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('text<');
      parser.end();
      expect(collectCalls(onText)).toBe('text<');
      expect(onThinking).not.toHaveBeenCalled();
    });
  });

  describe('newline handling', () => {
    it('strips single newline after <think>', () => {
      const { parser, onThinking } = createParser();
      parser.push('<think>\nreasoning</think>');
      parser.end();
      expect(collectCalls(onThinking)).toBe('reasoning');
    });

    it('strips up to 2 newlines after </think>', () => {
      const { parser, onText } = createParser();
      parser.push('<think>r</think>\n\ntext');
      parser.end();
      expect(collectCalls(onText)).toBe('text');
    });

    it('strips single newline after </think>', () => {
      const { parser, onText } = createParser();
      parser.push('<think>r</think>\ntext');
      parser.end();
      expect(collectCalls(onText)).toBe('text');
    });

    it('does not strip 3 newlines after </think>', () => {
      const { parser, onText } = createParser();
      parser.push('<think>r</think>\n\n\ntext');
      parser.end();
      expect(collectCalls(onText)).toBe('\ntext');
    });
  });

  describe('empty think blocks', () => {
    it('handles empty think block', () => {
      const { parser, onText, onThinking } = createParser();
      parser.push('<think></think>response');
      parser.end();
      expect(onThinking).not.toHaveBeenCalled();
      expect(collectCalls(onText)).toBe('response');
    });
  });

  describe('realistic streaming patterns', () => {
    it('handles DeepSeek-style output', () => {
      const { parser, onText, onThinking } = createParser();
      // DeepSeek typically emits <think>\n at the start
      parser.push('<think>\n');
      parser.push('The user wants to analyze NVDA.');
      parser.push(' Let me use the deep-dive skill.\n');
      parser.push('</think>');
      parser.push('\n\n');
      parser.push("Here's my analysis of NVIDIA (NVDA):");
      parser.end();
      expect(collectCalls(onThinking)).toBe(
        'The user wants to analyze NVDA. Let me use the deep-dive skill.\n',
      );
      expect(collectCalls(onText)).toBe("Here's my analysis of NVIDIA (NVDA):");
    });
  });
});
