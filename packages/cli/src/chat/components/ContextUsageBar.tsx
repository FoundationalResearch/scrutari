import React from 'react';
import { Box, Text } from 'ink';

interface ContextUsageBarProps {
  currentTokens: number;
  maxTokens: number;
  isCompacting?: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function ContextUsageBar({ currentTokens, maxTokens, isCompacting }: ContextUsageBarProps): React.ReactElement {
  const pct = maxTokens > 0 ? Math.min(currentTokens / maxTokens, 1) : 0;
  const barWidth = 20;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;

  let barColor: string = 'blue';
  if (pct > 0.7) barColor = 'red';
  else if (pct >= 0.5) barColor = 'yellow';

  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  const pctDisplay = `${Math.round(pct * 100)}%`;

  return (
    <Box gap={1}>
      <Text dimColor>Context:</Text>
      <Text bold>{formatTokens(currentTokens)}</Text>
      <Text dimColor>/</Text>
      <Text>{formatTokens(maxTokens)}</Text>
      <Text dimColor>({pctDisplay})</Text>
      <Text color={barColor}>{bar}</Text>
      {isCompacting && <Text color="yellow">{'\u27F3'} Compacting...</Text>}
    </Box>
  );
}
