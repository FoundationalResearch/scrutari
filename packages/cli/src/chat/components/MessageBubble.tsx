import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ChatMessage, ToolCallInfo } from '../types.js';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

function ToolCallStatus({ toolCall }: { toolCall: ToolCallInfo }): React.ReactElement {
  return (
    <Box gap={1}>
      {toolCall.status === 'running' && (
        <Text color="cyan"><Spinner type="dots" /></Text>
      )}
      {toolCall.status === 'done' && (
        <Text color="green">{'\u2713'}</Text>
      )}
      {toolCall.status === 'error' && (
        <Text color="red">{'\u2717'}</Text>
      )}
      <Text dimColor>{toolCall.name}</Text>
      {toolCall.status === 'running' && (
        <Text dimColor>running...</Text>
      )}
    </Box>
  );
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps): React.ReactElement {
  if (message.role === 'system') {
    return (
      <Box marginY={0}>
        <Text dimColor italic>{message.content}</Text>
      </Box>
    );
  }

  if (message.role === 'user') {
    return (
      <Box marginY={0}>
        <Text color="green" bold>{'\u276F'} </Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  // Assistant message
  return (
    <Box flexDirection="column" marginY={0}>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {message.toolCalls.map(tc => (
            <ToolCallStatus key={tc.id} toolCall={tc} />
          ))}
        </Box>
      )}
      {message.content && (
        <Box>
          <Text>{message.content}</Text>
          {isStreaming && <Text color="cyan">{'\u2588'}</Text>}
        </Box>
      )}
      {isStreaming && !message.content && (
        <Box gap={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text dimColor>Thinking...</Text>
        </Box>
      )}
    </Box>
  );
}
