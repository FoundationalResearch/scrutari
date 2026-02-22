import React, { useMemo } from 'react';
import { Text, useStdout } from 'ink';
import { renderMarkdown } from '../utils/renderMarkdown.js';

interface MarkdownTextProps {
  children: string;
  isStreaming?: boolean;
}

export function MarkdownText({
  children,
  isStreaming: _isStreaming,
}: MarkdownTextProps): React.ReactElement {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns || 80;

  const rendered = useMemo(() => {
    if (!children) return '';
    return renderMarkdown(children, termWidth);
  }, [children, termWidth]);

  return <Text>{rendered}</Text>;
}
