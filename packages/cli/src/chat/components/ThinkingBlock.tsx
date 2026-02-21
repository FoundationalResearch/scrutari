import React from 'react';
import { Box, Text } from 'ink';

interface ThinkingBlockProps {
  content: string;
  verbose?: boolean;
}

export function ThinkingBlock({ content, verbose }: ThinkingBlockProps): React.ReactElement {
  if (!content) return <Box />;

  const lines = content.split('\n');
  const displayLines = verbose ? lines : lines.slice(0, 2);
  const truncated = !verbose && lines.length > 2;

  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={0}>
      <Text color="yellow" dimColor bold>Reasoning:</Text>
      {displayLines.map((line, i) => (
        <Text key={i} color="yellow" dimColor>{line}</Text>
      ))}
      {truncated && (
        <Text color="yellow" dimColor>... ({lines.length - 2} more lines, use --verbose to see all)</Text>
      )}
    </Box>
  );
}
