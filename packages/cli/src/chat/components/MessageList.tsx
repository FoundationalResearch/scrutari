import React from 'react';
import { Box } from 'ink';
import { MessageBubble } from './MessageBubble.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { PipelineProgress } from './PipelineProgress.js';
import { DryRunPreview } from './DryRunPreview.js';
import type { ChatMessage } from '../types.js';

interface MessageListProps {
  messages: ChatMessage[];
  streamingMessageId?: string;
  verbose?: boolean;
}

export function MessageList({ messages, streamingMessageId, verbose }: MessageListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {messages.map(msg => {
        const hasSegments = msg.thinkingSegments && msg.thinkingSegments.length > 0;
        return (
          <Box key={msg.id} flexDirection="column" marginBottom={0}>
            {msg.thinking && !hasSegments && (
              <ThinkingBlock content={msg.thinking} verbose={verbose} />
            )}
            <MessageBubble
              message={msg}
              isStreaming={msg.id === streamingMessageId}
              verbose={verbose}
            />
            {msg.dryRunPreview && (
              <DryRunPreview data={msg.dryRunPreview} />
            )}
            {msg.pipelineState && (
              <PipelineProgress state={msg.pipelineState} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
