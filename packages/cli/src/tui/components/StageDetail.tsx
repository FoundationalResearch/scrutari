import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { StageState, StageToolCall } from '../types.js';

interface StageDetailProps {
  stage: StageState;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function ToolCallRow({ toolCall }: { toolCall: StageToolCall }): React.ReactElement {
  switch (toolCall.status) {
    case 'running':
      return (
        <Box marginLeft={4} gap={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text dimColor>{toolCall.toolName}...</Text>
        </Box>
      );
    case 'done':
      return (
        <Box marginLeft={4} gap={1}>
          <Text color="green">{'\u2713'}</Text>
          <Text dimColor>{toolCall.toolName}</Text>
          {toolCall.durationMs !== undefined && (
            <Text dimColor>({formatDuration(toolCall.durationMs)})</Text>
          )}
        </Box>
      );
    case 'error':
      return (
        <Box marginLeft={4} gap={1}>
          <Text color="red">{'\u2717'}</Text>
          <Text dimColor>{toolCall.toolName}</Text>
          {toolCall.error && <Text color="red">{toolCall.error}</Text>}
        </Box>
      );
  }
}

export function StageDetail({ stage }: StageDetailProps): React.ReactElement | null {
  const hasToolCalls = stage.toolCalls && stage.toolCalls.length > 0;
  const hasStreamLines = stage.streamLines && stage.streamLines.length > 0;

  if (!hasToolCalls && !hasStreamLines) return null;

  // Collapsed: stage is done — show one-line summary
  if (stage.status === 'done' || stage.status === 'error') {
    const toolCount = stage.toolCalls?.length ?? 0;
    const lineCount = stage.streamLines?.length ?? 0;
    const parts: string[] = [];
    if (toolCount > 0) parts.push(`${toolCount} tool ${toolCount === 1 ? 'call' : 'calls'}`);
    if (lineCount > 0) parts.push(`${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`);
    if (parts.length === 0) return null;

    return (
      <Box marginLeft={4} marginBottom={0}>
        <Text dimColor italic>{'\u25B8'} {parts.join(', ')}</Text>
      </Box>
    );
  }

  // Expanded: stage is running — show live details
  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={0}>
      {stage.toolCalls?.map((tc) => (
        <ToolCallRow key={tc.callId} toolCall={tc} />
      ))}
      {hasStreamLines && (
        <Box flexDirection="column" marginLeft={4}>
          {stage.streamLines!.length > 4 && (
            <Text dimColor italic>... ({stage.streamLines!.length - 4} earlier lines)</Text>
          )}
          {stage.streamLines!.slice(-4).map((line, i) => (
            <Text key={i} dimColor italic>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
