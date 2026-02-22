import React from 'react';
import { Box, Text } from 'ink';

interface ThinkingBlockProps {
  content: string;
  verbose?: boolean;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, verbose, isStreaming }: ThinkingBlockProps): React.ReactElement {
  if (!content) return <Box />;

  // Collapsed: show one-line summary after streaming completes
  if (!isStreaming) {
    const lineCount = content.split('\n').length;
    return (
      <Box marginLeft={2} marginBottom={0}>
        <Text dimColor italic>{'\u25B8'} Thought ({lineCount} {lineCount === 1 ? 'line' : 'lines'})</Text>
      </Box>
    );
  }

  // Streaming: show live thinking content
  const lines = content.split('\n');
  const displayLines = verbose ? lines : lines.slice(-4);
  const truncated = !verbose && lines.length > 4;

  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={0}>
      {truncated && (
        <Text dimColor italic>... ({lines.length - 4} earlier lines)</Text>
      )}
      {displayLines.map((line, i) => (
        <Text key={i} dimColor italic>{line}</Text>
      ))}
    </Box>
  );
}
