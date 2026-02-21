import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ToolPermissionPromptProps {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
}

export function ToolPermissionPrompt({ toolName, args, onApprove, onDeny }: ToolPermissionPromptProps): React.ReactElement {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onApprove();
    } else if (input === 'n' || input === 'N') {
      onDeny();
    }
  });

  const argsSummary = Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginTop={1}>
      <Text bold color="blue">Tool Permission Required</Text>
      <Box marginTop={1} gap={1}>
        <Text>Tool:</Text>
        <Text bold>{toolName}</Text>
      </Box>
      {argsSummary && (
        <Box gap={1}>
          <Text dimColor>Args:</Text>
          <Text>{argsSummary}</Text>
        </Box>
      )}
      <Box marginTop={1} gap={2}>
        <Text bold color="green">[Y] Allow</Text>
        <Text bold color="red">[N] Deny</Text>
      </Box>
    </Box>
  );
}
