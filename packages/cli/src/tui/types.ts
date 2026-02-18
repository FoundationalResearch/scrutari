import type { PipelineEngine } from '@scrutari/core';

export type { PipelineEngine };

export type StageStatus = 'pending' | 'running' | 'done' | 'error';

export interface StageState {
  name: string;
  status: StageStatus;
  model?: string;
  elapsedMs?: number;
  costUsd?: number;
  output?: string[];
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
