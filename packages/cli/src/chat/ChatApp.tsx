import React, { useEffect, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { MCPClientManager } from '@scrutari/mcp';
import type { Config } from '../config/index.js';
import type { SessionSummary } from './session/types.js';
import { WelcomeBanner } from './components/WelcomeBanner.js';
import { MessageList } from './components/MessageList.js';
import { InputPrompt } from './components/InputPrompt.js';
import { useSession } from './hooks/useSession.js';
import { useOrchestrator } from './hooks/useOrchestrator.js';

interface ChatAppProps {
  config: Config;
  version: string;
  cwd: string;
  continueSession?: boolean;
  resumeId?: string;
  verbose?: boolean;
  skillNames: string[];
  recentSessions: SessionSummary[];
  mcpClient?: MCPClientManager;
}

export function ChatApp({
  config,
  version,
  cwd,
  continueSession,
  resumeId,
  verbose,
  skillNames,
  recentSessions,
  mcpClient,
}: ChatAppProps): React.ReactElement {
  const { exit } = useApp();
  const { messages, addMessage, updateMessage, save, session } = useSession({
    continueLatest: continueSession,
    resumeId,
  });
  const { isProcessing, streamingMessageId, sendMessage, abort } = useOrchestrator({
    config,
    verbose,
    addMessage,
    updateMessage,
    skillNames,
    mcpClient,
  });

  const [ctrlCCount, setCtrlCCount] = useState(0);

  // Reset Ctrl+C counter when processing state changes
  useEffect(() => {
    if (!isProcessing) setCtrlCCount(0);
  }, [isProcessing]);

  // Handle Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (isProcessing) {
        abort();
        setCtrlCCount(prev => prev + 1);
        if (ctrlCCount >= 1) {
          save();
          exit();
        }
      } else {
        save();
        exit();
      }
    }
  });

  const sessionInfo = continueSession || resumeId
    ? session.title
    : undefined;

  return (
    <Box flexDirection="column">
      <WelcomeBanner
        version={version}
        model={config.defaults.model}
        provider={config.defaults.provider}
        cwd={cwd}
        sessionInfo={sessionInfo}
        recentSessions={recentSessions}
      />
      <MessageList
        messages={messages}
        streamingMessageId={streamingMessageId ?? undefined}
        verbose={verbose}
      />
      <InputPrompt onSubmit={sendMessage} disabled={isProcessing} />
    </Box>
  );
}
