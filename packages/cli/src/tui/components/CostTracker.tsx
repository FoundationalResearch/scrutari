import React from 'react';
import { Box, Text } from 'ink';

interface CostTrackerProps {
  spent: number;
  budget: number;
}

export function CostTrackerDisplay({ spent, budget }: CostTrackerProps): React.ReactElement {
  const pct = Math.min(spent / budget, 1);
  const barWidth = 20;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;

  let barColor: string = 'green';
  if (pct > 0.8) barColor = 'red';
  else if (pct > 0.5) barColor = 'yellow';

  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

  return (
    <Box gap={1} marginBottom={1}>
      <Text dimColor>Budget:</Text>
      <Text bold>${spent.toFixed(2)}</Text>
      <Text dimColor>/</Text>
      <Text>${budget.toFixed(2)}</Text>
      <Text color={barColor}>{bar}</Text>
    </Box>
  );
}
