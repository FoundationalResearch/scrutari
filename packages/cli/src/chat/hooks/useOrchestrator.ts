import { useState, useCallback, useRef } from 'react';
import { randomUUID } from 'node:crypto';
import type { Config } from '../../config/index.js';
import type { ChatMessage, ToolCallInfo, OrchestratorConfig, PipelineEvent, PipelineRunState } from '../types.js';
import type { StageState } from '../../tui/types.js';
import { runOrchestrator } from '../orchestrator/agent.js';

interface UseOrchestratorOptions {
  config: Config;
  verbose?: boolean;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;
  skillNames: string[];
}

interface UseOrchestratorReturn {
  isProcessing: boolean;
  streamingMessageId: string | null;
  sendMessage: (text: string) => void;
  abort: () => void;
}

export function useOrchestrator({
  config,
  verbose,
  addMessage,
  updateMessage,
  skillNames,
}: UseOrchestratorOptions): UseOrchestratorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (isProcessing) return;

    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMessage);
    messagesRef.current = [...messagesRef.current, userMessage];

    const assistantId = randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addMessage(assistantMessage);
    setStreamingMessageId(assistantId);
    setIsProcessing(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    // Track accumulated state for updates
    let accContent = '';
    let accThinking = '';
    const toolCalls: ToolCallInfo[] = [];
    let pipelineState: PipelineRunState | null = null;

    const orchestratorConfig: OrchestratorConfig = {
      model: config.defaults.model,
      provider: config.defaults.provider,
      apiKey: config.providers[config.defaults.provider]?.api_key,
      maxBudget: config.defaults.max_budget_usd,
      abortSignal: abortController.signal,
      verbose,
      onTextDelta: (delta: string) => {
        accContent += delta;
        updateMessage(assistantId, { content: accContent });
      },
      onReasoningDelta: (delta: string) => {
        accThinking += delta;
        updateMessage(assistantId, { thinking: accThinking });
      },
      onToolCallStart: (info: ToolCallInfo) => {
        toolCalls.push(info);
        updateMessage(assistantId, { toolCalls: [...toolCalls] });
      },
      onToolCallComplete: (id: string, result: unknown) => {
        const tc = toolCalls.find(t => t.id === id);
        if (tc) {
          tc.status = 'done';
          tc.result = result;
          updateMessage(assistantId, { toolCalls: [...toolCalls] });
        }
      },
      onPipelineEvent: (event: PipelineEvent) => {
        switch (event.type) {
          case 'stage:start': {
            if (!pipelineState) {
              const stages: StageState[] = [];
              for (let i = 0; i < event.totalStages; i++) {
                stages.push({ name: `Stage ${i + 1}`, status: 'pending' });
              }
              stages[event.stageIndex] = { name: event.stageName, status: 'running', model: event.model };
              pipelineState = {
                ticker: '',
                skill: '',
                stages,
                currentStageIndex: event.stageIndex,
                totalCostUsd: 0,
                done: false,
              };
            } else {
              // Ensure stages array is large enough
              while (pipelineState.stages.length <= event.stageIndex) {
                pipelineState.stages.push({ name: `Stage ${pipelineState.stages.length}`, status: 'pending' });
              }
              pipelineState.stages[event.stageIndex] = { name: event.stageName, status: 'running', model: event.model };
              pipelineState.currentStageIndex = event.stageIndex;
            }
            updateMessage(assistantId, { pipelineState: { ...pipelineState } });
            break;
          }
          case 'stage:complete': {
            if (pipelineState) {
              const idx = pipelineState.stages.findIndex(s => s.name === event.stageName);
              if (idx >= 0) {
                pipelineState.stages[idx] = {
                  ...pipelineState.stages[idx],
                  status: 'done',
                  costUsd: event.costUsd,
                  elapsedMs: event.durationMs,
                };
                pipelineState.totalCostUsd += event.costUsd;
              }
              updateMessage(assistantId, { pipelineState: { ...pipelineState } });
            }
            break;
          }
          case 'stage:error': {
            if (pipelineState) {
              const idx = pipelineState.stages.findIndex(s => s.name === event.stageName);
              if (idx >= 0) {
                pipelineState.stages[idx] = { ...pipelineState.stages[idx], status: 'error' };
              }
              updateMessage(assistantId, { pipelineState: { ...pipelineState } });
            }
            break;
          }
          case 'pipeline:complete': {
            if (pipelineState) {
              pipelineState.done = true;
              pipelineState.totalCostUsd = event.totalCostUsd;
              pipelineState.report = event.report;
              updateMessage(assistantId, { pipelineState: { ...pipelineState } });
            }
            break;
          }
          case 'pipeline:error': {
            if (pipelineState) {
              pipelineState.done = true;
              pipelineState.error = event.error;
              updateMessage(assistantId, { pipelineState: { ...pipelineState } });
            }
            break;
          }
        }
      },
    };

    // Run the orchestrator
    const allMessages = [...messagesRef.current];
    runOrchestrator(allMessages, config, orchestratorConfig, skillNames)
      .then((result) => {
        // Final update with complete content
        updateMessage(assistantId, {
          content: result.content || accContent,
          thinking: result.thinking || accThinking,
        });
        messagesRef.current = [...messagesRef.current, {
          ...assistantMessage,
          content: result.content || accContent,
          thinking: result.thinking || accThinking,
          toolCalls,
          pipelineState: pipelineState ?? undefined,
        }];
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(assistantId, { content: accContent + '\n[Aborted]' });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          updateMessage(assistantId, { content: accContent + `\n[Error: ${message}]` });
        }
      })
      .finally(() => {
        setIsProcessing(false);
        setStreamingMessageId(null);
        abortRef.current = null;
      });
  }, [isProcessing, config, verbose, addMessage, updateMessage, skillNames]);

  return { isProcessing, streamingMessageId, sendMessage, abort };
}
