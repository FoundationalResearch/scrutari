import { randomUUID } from 'node:crypto';
import type { MCPClientManager } from '@scrutari/mcp';
import type { Config } from '../config/index.js';
import type { ContextBundle } from '../context/types.js';
import type { SkillSummary, AgentSkillSummary, AgentSkill, PipelineEstimate, HookManager } from '@scrutari/core';
import { calculateCost } from '@scrutari/core';
import { filterActiveRules } from '../context/rules.js';
import type { ChatMessage, ToolCallInfo, OrchestratorConfig, PipelineEvent, PipelineRunState } from '../chat/types.js';
import type { StageToolCall } from '../tui/types.js';
import { runOrchestrator } from '../chat/orchestrator/agent.js';
import type {
  ServerMessage,
  TextDelta,
  ReasoningDelta,
  ToolCallStart,
  ToolCallComplete,
  PipelineEventMessage,
  AssistantStart,
  AssistantComplete,
  ApprovalRequired,
  ToolPermissionRequired,
  CostUpdate,
  ProcessingState,
} from './protocol.js';
import type { WebSessionManager } from './session-manager.js';

const THROTTLE_MS = 50;

export interface OrchestratorBridgeOptions {
  config: Config;
  sessionManager: WebSessionManager;
  skillNames: string[];
  skillSummaries?: SkillSummary[];
  agentSkillSummaries?: AgentSkillSummary[];
  mcpClient?: MCPClientManager;
  contextBundle?: ContextBundle;
  hookManager?: HookManager;
  send: (msg: ServerMessage) => void;
}

export class OrchestratorBridge {
  private config: Config;
  private sessionManager: WebSessionManager;
  private skillNames: string[];
  private skillSummaries?: SkillSummary[];
  private agentSkillSummaries?: AgentSkillSummary[];
  private mcpClient?: MCPClientManager;
  private contextBundle?: ContextBundle;
  private hookManager?: HookManager;
  private send: (msg: ServerMessage) => void;

  private abortController: AbortController | null = null;
  private isProcessing = false;
  private sessionSpentUsd = 0;
  private activeAgentSkill?: AgentSkill;

  // Approval promise resolvers
  private pendingApprovalResolve: ((approved: boolean) => void) | null = null;
  private pendingPermissionResolve: ((approved: boolean) => void) | null = null;

  // Mode state
  planMode = false;
  dryRun = false;
  readOnly = false;

  constructor(options: OrchestratorBridgeOptions) {
    this.config = options.config;
    this.sessionManager = options.sessionManager;
    this.skillNames = options.skillNames;
    this.skillSummaries = options.skillSummaries;
    this.agentSkillSummaries = options.agentSkillSummaries;
    this.mcpClient = options.mcpClient;
    this.contextBundle = options.contextBundle;
    this.hookManager = options.hookManager;
    this.send = options.send;
    this.sessionSpentUsd = options.sessionManager.totalCostUsd;
  }

  async sendMessage(text: string): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.send({ type: 'processing', isProcessing: true } satisfies ProcessingState);

    // Create user message
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    this.sessionManager.addMessage(userMessage);
    this.send({
      type: 'user_message',
      id: userMessage.id,
      text: userMessage.content,
      timestamp: userMessage.timestamp,
    });

    // Create assistant placeholder
    const assistantId = randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    this.sessionManager.addMessage(assistantMessage);
    this.send({
      type: 'assistant_start',
      id: assistantId,
      timestamp: assistantMessage.timestamp,
    } satisfies AssistantStart);

    // Throttle state for text/reasoning deltas
    let textBuffer = '';
    let textTimer: ReturnType<typeof setTimeout> | null = null;
    let reasoningBuffer = '';
    let reasoningTimer: ReturnType<typeof setTimeout> | null = null;

    const flushText = () => {
      if (textBuffer) {
        this.send({ type: 'text_delta', delta: textBuffer } satisfies TextDelta);
        textBuffer = '';
      }
      if (textTimer) {
        clearTimeout(textTimer);
        textTimer = null;
      }
    };

    const flushReasoning = () => {
      if (reasoningBuffer) {
        this.send({ type: 'reasoning_delta', delta: reasoningBuffer } satisfies ReasoningDelta);
        reasoningBuffer = '';
      }
      if (reasoningTimer) {
        clearTimeout(reasoningTimer);
        reasoningTimer = null;
      }
    };

    // Accumulated content for final message
    let accContent = '';
    let accThinking = '';
    const toolCalls: ToolCallInfo[] = [];
    let pipelineState: PipelineRunState | null = null;

    const abortController = new AbortController();
    this.abortController = abortController;

    // Session budget enforcement
    const sessionBudget = this.config.defaults.session_budget_usd;
    if (this.sessionSpentUsd >= sessionBudget) {
      const budgetMsg = `Session budget exhausted ($${this.sessionSpentUsd.toFixed(4)} of $${sessionBudget.toFixed(2)}). Start a new session or increase \`session_budget_usd\` in config.`;
      this.sessionManager.updateMessage(assistantId, { content: budgetMsg });
      this.send({
        type: 'assistant_complete',
        id: assistantId,
        content: budgetMsg,
        thinking: '',
      } satisfies AssistantComplete);
      this.isProcessing = false;
      this.send({ type: 'processing', isProcessing: false } satisfies ProcessingState);
      return;
    }

    const orchestratorConfig: OrchestratorConfig = {
      model: this.config.defaults.model,
      provider: this.config.defaults.provider,
      apiKey: this.config.providers[this.config.defaults.provider]?.api_key,
      maxBudget: this.config.defaults.max_budget_usd,
      abortSignal: abortController.signal,
      onTextDelta: (delta: string) => {
        accContent += delta;
        textBuffer += delta;
        if (!textTimer) {
          textTimer = setTimeout(flushText, THROTTLE_MS);
        }
      },
      onReasoningDelta: (delta: string) => {
        accThinking += delta;
        reasoningBuffer += delta;
        if (!reasoningTimer) {
          reasoningTimer = setTimeout(flushReasoning, THROTTLE_MS);
        }
      },
      onToolCallStart: (info: ToolCallInfo) => {
        toolCalls.push(info);
        this.send({ type: 'tool_call_start', toolCall: info } satisfies ToolCallStart);
      },
      onToolCallComplete: (id: string, result: unknown) => {
        const tc = toolCalls.find(t => t.id === id);
        if (tc) {
          tc.status = 'done';
          tc.result = result;
        }
        this.send({ type: 'tool_call_complete', id, result } satisfies ToolCallComplete);
      },
      onAgentSkillActivated: (skill: AgentSkill) => {
        this.activeAgentSkill = skill;
      },
      onApprovalRequired: (estimate: PipelineEstimate) => {
        this.send({ type: 'approval_required', estimate } satisfies ApprovalRequired);
        return new Promise<boolean>((resolve) => {
          this.pendingApprovalResolve = resolve;
        });
      },
      onPermissionRequired: (toolName: string, args: Record<string, unknown>) => {
        this.send({ type: 'tool_permission_required', toolName, args } satisfies ToolPermissionRequired);
        return new Promise<boolean>((resolve) => {
          this.pendingPermissionResolve = resolve;
        });
      },
      onPipelineEvent: (event: PipelineEvent) => {
        pipelineState = this.handlePipelineEvent(event, pipelineState, assistantId);
        this.send({
          type: 'pipeline_event',
          event,
          pipelineState: { ...pipelineState },
        } satisfies PipelineEventMessage);
      },
    };

    // Filter context rules
    let filteredContextBundle = this.contextBundle;
    if (this.contextBundle) {
      const upperText = text.toUpperCase();
      const tickerMatch = upperText.match(/\b([A-Z]{1,5})\b/);
      const matchContext = { ticker: tickerMatch?.[1], topic: text.toLowerCase() };
      const activeRules = filterActiveRules(this.contextBundle.rules, matchContext);
      filteredContextBundle = { ...this.contextBundle, rules: activeRules };
    }

    try {
      const allMessages = [...this.sessionManager.messages];
      const result = await runOrchestrator(allMessages, this.config, orchestratorConfig, this.skillNames, this.mcpClient, {
        planMode: this.planMode,
        dryRun: this.dryRun,
        readOnly: this.readOnly,
        contextBundle: filteredContextBundle,
        skillSummaries: this.skillSummaries,
        agentSkillSummaries: this.agentSkillSummaries,
        activeAgentSkill: this.activeAgentSkill,
        sessionSpentUsd: this.sessionSpentUsd,
        sessionBudgetUsd: this.config.defaults.session_budget_usd,
        permissions: this.config.permissions,
        hookManager: this.hookManager,
      });

      // Flush remaining buffers
      flushText();
      flushReasoning();

      // Track orchestrator LLM cost
      if (result.usage) {
        const orchestratorCost = calculateCost(
          this.config.defaults.model,
          result.usage.inputTokens,
          result.usage.outputTokens,
        );
        if (orchestratorCost > 0) {
          this.sessionSpentUsd += orchestratorCost;
          this.sessionManager.addCost(orchestratorCost);
        }
      }

      // Update session message
      const finalContent = result.content || accContent;
      const finalThinking = result.thinking || accThinking;
      this.sessionManager.updateMessage(assistantId, {
        content: finalContent,
        thinking: finalThinking,
        toolCalls,
        pipelineState: pipelineState ?? undefined,
      });

      this.send({
        type: 'assistant_complete',
        id: assistantId,
        content: finalContent,
        thinking: finalThinking,
        usage: result.usage,
      } satisfies AssistantComplete);

      this.send({
        type: 'cost_update',
        sessionCostUsd: this.sessionSpentUsd,
        budgetUsd: this.config.defaults.session_budget_usd,
      } satisfies CostUpdate);

    } catch (err) {
      flushText();
      flushReasoning();

      if (err instanceof Error && err.name === 'AbortError') {
        const abortedContent = accContent + '\n[Aborted]';
        this.sessionManager.updateMessage(assistantId, { content: abortedContent });
        this.send({
          type: 'assistant_complete',
          id: assistantId,
          content: abortedContent,
          thinking: accThinking,
        } satisfies AssistantComplete);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const errorContent = accContent + `\n[Error: ${message}]`;
        this.sessionManager.updateMessage(assistantId, { content: errorContent });
        this.send({
          type: 'assistant_complete',
          id: assistantId,
          content: errorContent,
          thinking: accThinking,
        } satisfies AssistantComplete);
        this.send({ type: 'error', message } satisfies ServerMessage);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.send({ type: 'processing', isProcessing: false } satisfies ProcessingState);
    }
  }

  resolveApproval(approved: boolean): void {
    if (this.pendingApprovalResolve) {
      this.pendingApprovalResolve(approved);
      this.pendingApprovalResolve = null;
    }
  }

  resolvePermission(approved: boolean): void {
    if (this.pendingPermissionResolve) {
      this.pendingPermissionResolve(approved);
      this.pendingPermissionResolve = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  private handlePipelineEvent(
    event: PipelineEvent,
    state: PipelineRunState | null,
    assistantId: string,
  ): PipelineRunState {
    if (!state) {
      state = {
        ticker: '',
        skill: '',
        stages: [],
        currentStageIndex: 0,
        totalCostUsd: 0,
        done: false,
      };
    }

    switch (event.type) {
      case 'stage:start': {
        while (state.stages.length <= event.stageIndex) {
          state.stages.push({ name: `Stage ${state.stages.length + 1}`, status: 'pending' });
        }
        // Initialize all stages on first event if totalStages is known
        if (state.stages.length < event.totalStages) {
          for (let i = state.stages.length; i < event.totalStages; i++) {
            state.stages.push({ name: `Stage ${i + 1}`, status: 'pending' });
          }
        }
        state.stages[event.stageIndex] = { name: event.stageName, status: 'running', model: event.model };
        state.currentStageIndex = event.stageIndex;
        break;
      }
      case 'stage:stream': {
        const idx = state.stages.findIndex(s => s.name === event.stageName);
        if (idx >= 0) {
          const stage = state.stages[idx];
          const lines = stage.streamLines ?? [];
          const newLines = event.chunk.split('\n');
          if (lines.length > 0 && newLines.length > 0) {
            lines[lines.length - 1] += newLines[0];
            lines.push(...newLines.slice(1));
          } else {
            lines.push(...newLines);
          }
          const capped = lines.length > 20 ? lines.slice(-20) : lines;
          state.stages[idx] = { ...stage, streamLines: capped };
        }
        break;
      }
      case 'stage:tool-start': {
        const idx = state.stages.findIndex(s => s.name === event.stageName);
        if (idx >= 0) {
          const stage = state.stages[idx];
          const calls: StageToolCall[] = stage.toolCalls ?? [];
          calls.push({ callId: event.callId, toolName: event.toolName, status: 'running' });
          state.stages[idx] = { ...stage, toolCalls: [...calls] };
        }
        break;
      }
      case 'stage:tool-end': {
        const idx = state.stages.findIndex(s => s.name === event.stageName);
        if (idx >= 0) {
          const stage = state.stages[idx];
          const calls = stage.toolCalls ?? [];
          const tcIdx = calls.findIndex(tc => tc.callId === event.callId);
          if (tcIdx >= 0) {
            calls[tcIdx] = {
              ...calls[tcIdx],
              status: event.success ? 'done' : 'error',
              durationMs: event.durationMs,
              error: event.error,
            };
            state.stages[idx] = { ...stage, toolCalls: [...calls] };
          }
        }
        break;
      }
      case 'stage:complete': {
        const idx = state.stages.findIndex(s => s.name === event.stageName);
        if (idx >= 0) {
          state.stages[idx] = {
            ...state.stages[idx],
            status: 'done',
            costUsd: event.costUsd,
            elapsedMs: event.durationMs,
          };
          state.totalCostUsd += event.costUsd;
        }
        break;
      }
      case 'stage:error': {
        const idx = state.stages.findIndex(s => s.name === event.stageName);
        if (idx >= 0) {
          state.stages[idx] = { ...state.stages[idx], status: 'error' };
        }
        break;
      }
      case 'pipeline:complete': {
        state.done = true;
        state.totalCostUsd = event.totalCostUsd;
        state.report = event.report;
        this.sessionSpentUsd += event.totalCostUsd;
        this.sessionManager.addCost(event.totalCostUsd);
        this.send({
          type: 'cost_update',
          sessionCostUsd: this.sessionSpentUsd,
          budgetUsd: this.config.defaults.session_budget_usd,
        } satisfies CostUpdate);
        break;
      }
      case 'pipeline:error': {
        state.done = true;
        state.error = event.error;
        break;
      }
    }

    this.sessionManager.updateMessage(assistantId, { pipelineState: { ...state } });
    return state;
  }
}
