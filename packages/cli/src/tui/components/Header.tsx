import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  ticker: string;
  skill: string;
  model: string;
}

export function Header({ ticker, skill, model }: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">scrutari</Text>
        <Text dimColor> | </Text>
        <Text>Analyzing: </Text>
        <Text bold color="green">{ticker}</Text>
      </Box>
      <Box gap={2}>
        <Box>
          <Text dimColor>Skill: </Text>
          <Text>{skill}</Text>
        </Box>
        <Box>
          <Text dimColor>Model: </Text>
          <Text>{model}</Text>
        </Box>
      </Box>
    </Box>
  );
}
