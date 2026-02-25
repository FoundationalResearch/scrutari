import type { PipelineEngine } from '@scrutari/core';

export type { PipelineEngine };

export type StageStatus = 'pending' | 'running' | 'done' | 'error';

export interface StageToolCall {
  callId: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
  error?: string;
}

export interface StageState {
  name: string;
  status: StageStatus;
  model?: string;
  elapsedMs?: number;
  costUsd?: number;
  output?: string[];
  toolCalls?: StageToolCall[];
  streamLines?: string[];
}

export interface AnalysisState {
  ticker: string;
  skill: string;
  model: string;
  budgetUsd: number;
  totalCostUsd: number;
  stages: StageState[];
  currentStageIndex: number;
  done: boolean;
  error?: string;
  outputPath?: string;
}

export interface AnalysisProps {
  ticker: string;
  skill: string;
  model: string;
  budgetUsd: number;
  stages: string[];
  pipeline?: PipelineEngine;
  outputDir?: string;
  outputFormat?: string;
  verbose?: boolean;
}
