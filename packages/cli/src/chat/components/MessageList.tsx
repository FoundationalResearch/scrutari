import React from 'react';
import { Box } from 'ink';
import { MessageBubble } from './MessageBubble.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { PipelineProgress } from './PipelineProgress.js';
import { DryRunPreview } from './DryRunPreview.js';
import type { ChatMessage } from '../types.js';

interface MessageItemProps {
  msg: ChatMessage;
  isStreaming: boolean;
  verbose?: boolean;
}

/** Renders a single message with its thinking block, pipeline progress, and dry-run preview. */
export function MessageItem({ msg, isStreaming, verbose }: MessageItemProps): React.ReactElement {
  const hasSegments = msg.thinkingSegments && msg.thinkingSegments.length > 0;
  return (
    <Box flexDirection="column" marginBottom={0}>
      {msg.thinking && !hasSegments && (
        <ThinkingBlock content={msg.thinking} verbose={verbose} isStreaming={isStreaming} />
      )}
      <MessageBubble
        message={msg}
        isStreaming={isStreaming}
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
}
