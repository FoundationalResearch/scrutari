import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ChatMessage, ThinkingSegment, ToolCallInfo } from '../types.js';
import { MarkdownText } from './MarkdownText.js';

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

function InlineThinking({ segment, verbose, isStreaming }: { segment: ThinkingSegment; verbose?: boolean; isStreaming?: boolean }): React.ReactElement {
  // Collapsed: show one-line summary after streaming completes
  if (!isStreaming) {
    const lineCount = segment.content.split('\n').length;
    return (
      <Box marginLeft={2} marginBottom={0}>
        <Text dimColor italic>{'\u25B8'} Thought ({lineCount} {lineCount === 1 ? 'line' : 'lines'})</Text>
      </Box>
    );
  }

  // Streaming: show live content
  const lines = segment.content.split('\n');
  const displayLines = verbose ? lines : lines.slice(-4);
  const truncated = !verbose && lines.length > 4;

  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={0}>
      {truncated && (
        <Text dimColor italic>... ({lines.length - 4} earlier lines)</Text>
      )}
      {displayLines.map((line, i) => (
        <Text key={i} dimColor italic>{line}</Text>
      ))}
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
      {unlinkedSegments.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {unlinkedSegments.map((seg, i) => (
            <InlineThinking key={`unlinked-${i}`} segment={seg} verbose={verbose} isStreaming={isStreaming} />
          ))}
        </Box>
      )}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {message.toolCalls.map(tc => {
            const seg = segmentsByToolCall.get(tc.id);
            return (
              <Box key={tc.id} flexDirection="column">
                {seg && <InlineThinking segment={seg} verbose={verbose} isStreaming={isStreaming} />}
                <ToolCallStatus toolCall={tc} />
              </Box>
            );
          })}
        </Box>
      )}
      {message.content && (
        <Box flexDirection="column">
          <MarkdownText isStreaming={isStreaming}>
            {message.content}
          </MarkdownText>
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
