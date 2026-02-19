import React from 'react';
import { Box } from 'ink';
import { MessageBubble } from './MessageBubble.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { PipelineProgress } from './PipelineProgress.js';
import type { ChatMessage } from '../types.js';

interface MessageListProps {
  messages: ChatMessage[];
  streamingMessageId?: string;
  verbose?: boolean;
}

export function MessageList({ messages, streamingMessageId, verbose }: MessageListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {messages.map(msg => (
        <Box key={msg.id} flexDirection="column" marginBottom={0}>
          {msg.thinking && (
            <ThinkingBlock content={msg.thinking} verbose={verbose} />
          )}
          <MessageBubble
            message={msg}
            isStreaming={msg.id === streamingMessageId}
          />
          {msg.pipelineState && (
            <PipelineProgress state={msg.pipelineState} />
          )}
        </Box>
      ))}
    </Box>
  );
}
