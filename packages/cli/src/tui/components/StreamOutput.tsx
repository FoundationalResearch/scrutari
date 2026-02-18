import React from 'react';
import { Box, Text } from 'ink';

interface StreamOutputProps {
  lines: string[];
  maxLines?: number;
}

export function StreamOutput({ lines, maxLines = 8 }: StreamOutputProps): React.ReactElement {
  const visibleLines = lines.slice(-maxLines);

  if (visibleLines.length === 0) {
    return <Box />;
  }

  return (
    <Box flexDirection="column">
      <Text bold dimColor>{'\u2500\u2500\u2500 Live Output \u2500\u2500\u2500'}</Text>
      {visibleLines.map((line, i) => (
        <Text key={i} wrap="truncate">{line}</Text>
      ))}
    </Box>
  );
}
