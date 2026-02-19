import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeBannerProps {
  version: string;
  model: string;
  provider: string;
  sessionInfo?: string;
}

export function WelcomeBanner({ version, model, provider, sessionInfo }: WelcomeBannerProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">scrutari</Text>
        <Text dimColor> v{version}</Text>
      </Box>
      <Box gap={2}>
        <Box>
          <Text dimColor>Model: </Text>
          <Text>{model}</Text>
        </Box>
        <Box>
          <Text dimColor>Provider: </Text>
          <Text>{provider}</Text>
        </Box>
      </Box>
      {sessionInfo && (
        <Text dimColor>{sessionInfo}</Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>Ask me to analyze any stock, e.g. &quot;analyze NVDA&quot;. Press Ctrl+C to exit.</Text>
      </Box>
    </Box>
  );
}
