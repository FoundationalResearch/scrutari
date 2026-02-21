import React from 'react';
import { Box, Text } from 'ink';

interface BudgetDisplayProps {
  spentUsd: number;
  budgetUsd: number;
}

export function BudgetDisplay({ spentUsd, budgetUsd }: BudgetDisplayProps): React.ReactElement | null {
  if (spentUsd <= 0) return null;

  const ratio = budgetUsd > 0 ? spentUsd / budgetUsd : 0;

  if (ratio >= 1.0) {
    return (
      <Box>
        <Text color="red">
          Session: ${spentUsd.toFixed(4)} / ${budgetUsd.toFixed(2)}{' '}
        </Text>
        <Text color="red" bold>[Budget exceeded]</Text>
      </Box>
    );
  }

  if (ratio >= 0.8) {
    return (
      <Box>
        <Text color="yellow">
          Session: ${spentUsd.toFixed(4)} / ${budgetUsd.toFixed(2)}{' '}
        </Text>
        <Text color="yellow" bold>[Approaching limit]</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text dimColor>
        Session: ${spentUsd.toFixed(4)} / ${budgetUsd.toFixed(2)}
      </Text>
    </Box>
  );
}
