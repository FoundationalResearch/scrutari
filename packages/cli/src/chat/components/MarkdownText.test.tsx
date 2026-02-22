import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MarkdownText } from './MarkdownText.js';

describe('MarkdownText', () => {
  it('renders markdown content', () => {
    const { lastFrame } = render(
      <MarkdownText>{'**bold text**'}</MarkdownText>,
    );
    expect(lastFrame()).toContain('bold text');
  });

  it('renders plain text without errors', () => {
    const { lastFrame } = render(
      <MarkdownText>{'Hello world'}</MarkdownText>,
    );
    expect(lastFrame()).toContain('Hello world');
  });

  it('renders empty string', () => {
    const { lastFrame } = render(<MarkdownText>{''}</MarkdownText>);
    expect(lastFrame()).toBe('');
  });

  it('renders during streaming', () => {
    const { lastFrame } = render(
      <MarkdownText isStreaming>{'Partial **content**'}</MarkdownText>,
    );
    expect(lastFrame()).toContain('content');
  });

  it('renders tables', () => {
    const table = '| Col1 | Col2 |\n|------|------|\n| A    | B    |';
    const { lastFrame } = render(<MarkdownText>{table}</MarkdownText>);
    const output = lastFrame();
    expect(output).toContain('Col1');
    expect(output).toContain('Col2');
    expect(output).toContain('A');
    expect(output).toContain('B');
  });

  it('renders headers', () => {
    const { lastFrame } = render(
      <MarkdownText>{'# My Header'}</MarkdownText>,
    );
    expect(lastFrame()).toContain('My Header');
  });

  it('renders code blocks', () => {
    const code = '```js\nconst x = 1;\n```';
    const { lastFrame } = render(<MarkdownText>{code}</MarkdownText>);
    expect(lastFrame()).toContain('const x = 1');
  });

  it('renders lists', () => {
    const list = '- apple\n- banana\n- cherry';
    const { lastFrame } = render(<MarkdownText>{list}</MarkdownText>);
    const output = lastFrame();
    expect(output).toContain('apple');
    expect(output).toContain('banana');
    expect(output).toContain('cherry');
  });
});
