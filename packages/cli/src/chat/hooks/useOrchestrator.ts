import { useState, useCallback, useRef } from 'react';
import { randomUUID } from 'node:crypto';
import type { MCPClientManager } from '@scrutari/mcp';
import type { Config } from '../../config/index.js';
import type { PipelineEstimate, SkillSummary, AgentSkillSummary, AgentSkill, HookManager } from '@scrutari/core';
import { calculateCost } from '@scrutari/core';
import type { ContextBundle } from '../../context/types.js';
import { filterActiveRules } from '../../context/rules.js';
import type { ChatMessage, ThinkingSegment, ToolCallInfo, OrchestratorConfig, PipelineEvent, PipelineRunState, DryRunPreviewData } from '../types.js';
import type { StageState } from '../../tui/types.js';
import { runOrchestrator } from '../orchestrator/agent.js';

interface UseOrchestratorOptions {
  config: Config;
  verbose?: boolean;
  planMode?: boolean;
  dryRun?: boolean;
  readOnly?: boolean;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;
  skillNames: string[];
  skillSummaries?: SkillSummary[];
  agentSkillSummaries?: AgentSkillSummary[];
  mcpClient?: MCPClientManager;
  contextBundle?: ContextBundle;
  onBeforeSend?: () => Promise<void>;
  onUsageUpdate?: (inputTokens: number) => void;
  onAnalysisComplete?: (tickers: string[], skill?: string) => void;
  initialSessionCost?: number;
  onCostIncurred?: (cost: number) => void;
  hookManager?: HookManager;
}

interface PendingApproval {
  estimate: PipelineEstimate;
  resolve: (approved: boolean) => void;
}

export interface PendingToolPermission {
  toolName: string;
  args: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

interface UseOrchestratorReturn {
  isProcessing: boolean;
  streamingMessageId: string | null;
  sessionSpentUsd: number;
  pendingApproval: PendingApproval | null;
  handleApproval: (approved: boolean) => void;
  pendingToolPermission: PendingToolPermission | null;
  handleToolPermission: (approved: boolean) => void;
  sendMessage: (text: string) => void;
  abort: () => void;
}

export function useOrchestrator({
  config,
  verbose,
  planMode,
  dryRun,
  readOnly,
  addMessage,
  updateMessage,
  skillNames,
  skillSummaries,
  agentSkillSummaries,
  mcpClient,
  contextBundle,
  onBeforeSend,
  onUsageUpdate,
  onAnalysisComplete,
  initialSessionCost,
  onCostIncurred,
  hookManager,
}: UseOrchestratorOptions): UseOrchestratorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pendingToolPermission, setPendingToolPermission] = useState<PendingToolPermission | null>(null);
  const [activeAgentSkill, setActiveAgentSkill] = useState<AgentSkill | undefined>(undefined);
  const sessionSpentRef = useRef(initialSessionCost ?? 0);
  const [sessionSpentUsd, setSessionSpentUsd] = useState(initialSessionCost ?? 0);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleApproval = useCallback((approved: boolean) => {
    if (pendingApproval) {
      pendingApproval.resolve(approved);
      setPendingApproval(null);
    }
  }, [pendingApproval]);

  const handleToolPermission = useCallback((approved: boolean) => {
    if (pendingToolPermission) {
      pendingToolPermission.resolve(approved);
      setPendingToolPermission(null);
    }
  }, [pendingToolPermission]);

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

    // Session budget enforcement: block new LLM calls when budget is exhausted
    const sessionBudget = config.defaults.session_budget_usd;
    if (sessionSpentRef.current >= sessionBudget) {
      updateMessage(assistantId, {
        content: `Session budget exhausted ($${sessionSpentRef.current.toFixed(4)} of $${sessionBudget.toFixed(2)}). Start a new session or increase \`session_budget_usd\` in config.`,
      });
      setIsProcessing(false);
      setStreamingMessageId(null);
      return;
    }

    // Track accumulated state for updates
    let accContent = '';
    let accThinking = '';
    let currentThinkingBuffer = '';
    const thinkingSegments: ThinkingSegment[] = [];
    const toolCalls: ToolCallInfo[] = [];
    let pipelineState: PipelineRunState | null = null;
    let dryRunPreview: DryRunPreviewData | undefined;

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
        currentThinkingBuffer += delta;
        updateMessage(assistantId, { thinking: accThinking });
      },
      onToolCallStart: (info: ToolCallInfo) => {
        if (currentThinkingBuffer.trim()) {
          thinkingSegments.push({
            content: currentThinkingBuffer.trim(),
            toolCallId: info.id,
          });
          currentThinkingBuffer = '';
          updateMessage(assistantId, { thinkingSegments: [...thinkingSegments] });
        }
        toolCalls.push(info);
        updateMessage(assistantId, { toolCalls: [...toolCalls] });
      },
      onToolCallComplete: (id: string, result: unknown) => {
        const tc = toolCalls.find(t => t.id === id);
        if (tc) {
          tc.status = 'done';
          tc.result = result;
          updateMessage(assistantId, { toolCalls: [...toolCalls] });

          // Detect dry-run or preview results and populate dryRunPreview
          const res = result as Record<string, unknown> | null;
          if (res && typeof res === 'object') {
            if ((res.dryRun === true || res.preview === true) && res.skillName && res.estimate) {
              const estimate = res.estimate as Record<string, unknown>;
              dryRunPreview = {
                skillName: res.skillName as string,
                inputs: (res.inputs as Record<string, unknown>) ?? {},
                estimate: estimate as unknown as import('@scrutari/core').PipelineEstimate,
              };
              updateMessage(assistantId, { dryRunPreview });
            } else if (res.preview === true && res.stages) {
              // preview_pipeline returns estimate fields at top level
              dryRunPreview = {
                skillName: res.skillName as string,
                inputs: (res.inputs as Record<string, unknown>) ?? {},
                estimate: {
                  skillName: res.skillName as string,
                  stages: res.stages as unknown as import('@scrutari/core').StageEstimate[],
                  executionLevels: res.executionLevels as string[][],
                  totalEstimatedCostUsd: res.totalEstimatedCostUsd as number,
                  totalEstimatedTimeSeconds: res.totalEstimatedTimeSeconds as number,
                  toolsRequired: (res.toolsRequired as string[]) ?? [],
                  toolsOptional: (res.toolsOptional as string[]) ?? [],
                },
              };
              updateMessage(assistantId, { dryRunPreview });
            }
          }
        }
      },
      onAgentSkillActivated: (skill: AgentSkill) => {
        setActiveAgentSkill(skill);
      },
      onApprovalRequired: (estimate: PipelineEstimate) => {
        return new Promise<boolean>((resolve) => {
          setPendingApproval({ estimate, resolve });
        });
      },
      onPermissionRequired: (toolName: string, args: Record<string, unknown>) => {
        return new Promise<boolean>((resolve) => {
          setPendingToolPermission({ toolName, args, resolve });
        });
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
            sessionSpentRef.current += event.totalCostUsd;
            setSessionSpentUsd(sessionSpentRef.current);
            if (onCostIncurred) onCostIncurred(event.totalCostUsd);
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

    // Filter context rules based on message content
    let filteredContextBundle = contextBundle;
    if (contextBundle) {
      const upperText = text.toUpperCase();
      // Extract ticker-like patterns (1-5 uppercase letters)
      const tickerMatch = upperText.match(/\b([A-Z]{1,5})\b/);
      const matchContext = {
        ticker: tickerMatch?.[1],
        topic: text.toLowerCase(),
      };
      const activeRules = filterActiveRules(contextBundle.rules, matchContext);
      filteredContextBundle = { ...contextBundle, rules: activeRules };
    }

    // Run the orchestrator (with optional pre-send hook for auto-compaction)
    const runWithHooks = async () => {
      if (onBeforeSend) await onBeforeSend();
      const allMessages = [...messagesRef.current];
      return runOrchestrator(allMessages, config, orchestratorConfig, skillNames, mcpClient, {
        planMode,
        dryRun,
        readOnly,
        contextBundle: filteredContextBundle,
        skillSummaries,
        agentSkillSummaries,
        activeAgentSkill,
        sessionSpentUsd: sessionSpentRef.current,
        sessionBudgetUsd: config.defaults.session_budget_usd,
        permissions: config.permissions,
        hookManager,
      });
    };

    runWithHooks()
      .then((result) => {
        // Report actual token usage for calibration
        if (onUsageUpdate && result.usage) {
          onUsageUpdate(result.usage.inputTokens);
        }

        // Track orchestrator LLM cost in session budget
        if (result.usage) {
          const orchestratorCost = calculateCost(
            config.defaults.model,
            result.usage.inputTokens,
            result.usage.outputTokens,
          );
          if (orchestratorCost > 0) {
            sessionSpentRef.current += orchestratorCost;
            setSessionSpentUsd(sessionSpentRef.current);
            if (onCostIncurred) onCostIncurred(orchestratorCost);
          }
        }

        // Flush any remaining thinking buffer as an unlinked segment
        if (currentThinkingBuffer.trim()) {
          thinkingSegments.push({ content: currentThinkingBuffer.trim() });
          currentThinkingBuffer = '';
        }

        // Final update with complete content
        const finalSegments = thinkingSegments.length > 0 ? [...thinkingSegments] : undefined;
        updateMessage(assistantId, {
          content: result.content || accContent,
          thinking: result.thinking || accThinking,
          thinkingSegments: finalSegments,
        });

        // Track tickers and analysis for user memory
        if (onAnalysisComplete) {
          const tickerPattern = /\b([A-Z]{1,5})\b/g;
          const matches = text.toUpperCase().match(tickerPattern) ?? [];
          // Filter out common English words that look like tickers
          const stopWords = new Set(['A', 'I', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE']);
          const tickers = [...new Set(matches)].filter(t => !stopWords.has(t));
          // Detect skill name from pipeline tool calls
          const pipelineCall = toolCalls.find(tc => tc.name === 'run_pipeline');
          const skillName = pipelineCall ? pipelineCall.args?.skill as string | undefined : undefined;
          if (tickers.length > 0) {
            onAnalysisComplete(tickers, skillName);
          }
        }

        messagesRef.current = [...messagesRef.current, {
          ...assistantMessage,
          content: result.content || accContent,
          thinking: result.thinking || accThinking,
          thinkingSegments: finalSegments,
          toolCalls,
          pipelineState: pipelineState ?? undefined,
          dryRunPreview,
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
  }, [isProcessing, config, verbose, planMode, dryRun, readOnly, addMessage, updateMessage, skillNames, skillSummaries, agentSkillSummaries, activeAgentSkill, mcpClient, contextBundle, onBeforeSend, onUsageUpdate, onAnalysisComplete, onCostIncurred]);

  return { isProcessing, streamingMessageId, sessionSpentUsd, pendingApproval, handleApproval, pendingToolPermission, handleToolPermission, sendMessage, abort };
}
