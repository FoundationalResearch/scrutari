import type { StageState } from '../tui/types.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
  pipelineState?: PipelineRunState;
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
}

export type PipelineEvent =
  | { type: 'stage:start'; stageName: string; model: string; stageIndex: number; totalStages: number }
  | { type: 'stage:stream'; stageName: string; chunk: string }
  | { type: 'stage:complete'; stageName: string; costUsd: number; durationMs: number }
  | { type: 'stage:error'; stageName: string; error: string }
  | { type: 'pipeline:complete'; totalCostUsd: number; report: string }
  | { type: 'pipeline:error'; error: string };
