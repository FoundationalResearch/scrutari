import type { StageState } from '../tui/types.js';
import type { PipelineEstimate, AgentSkill } from '@scrutari/core';

export interface ThinkingSegment {
  content: string;
  toolCallId?: string;
}

export interface DryRunPreviewData {
  skillName: string;
  inputs: Record<string, unknown>;
  estimate: PipelineEstimate;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  thinking?: string;
  thinkingSegments?: ThinkingSegment[];
  toolCalls?: ToolCallInfo[];
  pipelineState?: PipelineRunState;
  dryRunPreview?: DryRunPreviewData;
  isCompactionSummary?: boolean;
  compactedMessageIds?: string[];
  compactedAt?: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  result?: unknown;
}

export interface PipelineRunState {
  ticker: string;
  skill: string;
  stages: StageState[];
  currentStageIndex: number;
  totalCostUsd: number;
  done: boolean;
  error?: string;
  report?: string;
}

export interface OrchestratorConfig {
  model: string;
  provider: string;
  apiKey?: string;
  maxBudget: number;
  abortSignal?: AbortSignal;
  verbose?: boolean;
  onTextDelta: (delta: string) => void;
  onReasoningDelta: (delta: string) => void;
  onToolCallStart: (info: ToolCallInfo) => void;
  onToolCallComplete: (id: string, result: unknown) => void;
  onPipelineEvent: (event: PipelineEvent) => void;
  onApprovalRequired?: (estimate: PipelineEstimate) => Promise<boolean>;
  onPermissionRequired?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  onAgentSkillActivated?: (skill: AgentSkill) => void;
}

export type PipelineEvent =
  | { type: 'stage:start'; stageName: string; model: string; stageIndex: number; totalStages: number }
  | { type: 'stage:stream'; stageName: string; chunk: string }
  | { type: 'stage:complete'; stageName: string; costUsd: number; durationMs: number }
  | { type: 'stage:error'; stageName: string; error: string }
  | { type: 'stage:tool-start'; stageName: string; toolName: string; callId: string }
  | { type: 'stage:tool-end'; stageName: string; toolName: string; callId: string; durationMs: number; success: boolean; error?: string }
  | { type: 'pipeline:complete'; totalCostUsd: number; report: string }
  | { type: 'pipeline:error'; error: string };
