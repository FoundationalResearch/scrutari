import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ChatMessage, ThinkingSegment, ToolCallInfo } from '../types.js';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  verbose?: boolean;
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

function InlineThinking({ segment, verbose }: { segment: ThinkingSegment; verbose?: boolean }): React.ReactElement {
  if (verbose) {
    const lines = segment.content.split('\n');
    return (
      <Box flexDirection="column" marginLeft={2} marginBottom={0}>
        {lines.map((line, i) => (
          <Text key={i} color="yellow" dimColor>{line}</Text>
        ))}
      </Box>
    );
  }

  // Non-verbose: show one-line summary
  const firstLine = segment.content.split('\n')[0];
  const summary = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;

  return (
    <Box marginLeft={2} marginBottom={0}>
      <Text color="yellow" dimColor>{summary}</Text>
    </Box>
  );
}

export function MessageBubble({ message, isStreaming, verbose }: MessageBubbleProps): React.ReactElement {
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
        <Text color="blue" bold>{'\u276F'} </Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  // Assistant message
  const hasSegments = message.thinkingSegments && message.thinkingSegments.length > 0;
  const segmentsByToolCall = new Map<string, ThinkingSegment>();
  const unlinkedSegments: ThinkingSegment[] = [];

  if (hasSegments) {
    for (const seg of message.thinkingSegments!) {
      if (seg.toolCallId) {
        segmentsByToolCall.set(seg.toolCallId, seg);
      } else {
        unlinkedSegments.push(seg);
      }
    }
  }

  return (
    <Box flexDirection="column" marginY={0}>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {message.toolCalls.map(tc => {
            const seg = segmentsByToolCall.get(tc.id);
            return (
              <Box key={tc.id} flexDirection="column">
                {seg && <InlineThinking segment={seg} verbose={verbose} />}
                <ToolCallStatus toolCall={tc} />
              </Box>
            );
          })}
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
