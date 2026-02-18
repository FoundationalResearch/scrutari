import { useState, useEffect } from 'react';
import type {
  PipelineEngine,
  StageStartEvent,
  StageStreamEvent,
  StageCompleteEvent,
  StageErrorEvent,
  PipelineCompleteEvent,
  PipelineErrorEvent,
} from '@scrutari/core';
import type { AnalysisState } from '../types.js';

export function usePipelineEvents(
  ticker: string,
  skill: string,
  model: string,
  budgetUsd: number,
  stageNames: string[],
  pipeline?: PipelineEngine,
): AnalysisState {
  const [state, setState] = useState<AnalysisState>(() => ({
    ticker,
    skill,
    model,
    budgetUsd,
    totalCostUsd: 0,
    stages: stageNames.map(name => ({
      name,
      status: 'pending' as const,
      output: [],
    })),
    currentStageIndex: 0,
    done: false,
  }));

  useEffect(() => {
    if (!pipeline) return;

    const stageIndexMap = new Map(stageNames.map((name, i) => [name, i]));

    const onStageStart = (event: StageStartEvent) => {
      const idx = stageIndexMap.get(event.stageName);
      if (idx === undefined) return;

      setState(prev => {
        const stages = [...prev.stages];
        stages[idx] = {
          ...stages[idx],
          status: 'running',
          model: event.model,
          elapsedMs: 0,
          output: [],
        };
        return { ...prev, stages, currentStageIndex: idx };
      });
    };

    const onStageStream = (event: StageStreamEvent) => {
      const idx = stageIndexMap.get(event.stageName);
      if (idx === undefined) return;

      setState(prev => {
        const stages = [...prev.stages];
        const currentOutput = stages[idx].output ?? [];
        const lastLine = currentOutput[currentOutput.length - 1] ?? '';
        const chunks = (lastLine + event.chunk).split('\n');
        const newOutput = [
          ...currentOutput.slice(0, -1),
          ...chunks,
        ].filter(line => line.length > 0);

        stages[idx] = { ...stages[idx], output: newOutput };
        return { ...prev, stages };
      });
    };

    const onStageComplete = (event: StageCompleteEvent) => {
      const idx = stageIndexMap.get(event.stageName);
      if (idx === undefined) return;

      setState(prev => {
        const stages = [...prev.stages];
        stages[idx] = {
          ...stages[idx],
          status: 'done',
          elapsedMs: event.durationMs,
          costUsd: event.costUsd,
          model: event.model,
        };
        return {
          ...prev,
          stages,
          totalCostUsd: prev.totalCostUsd + event.costUsd,
        };
      });
    };

    const onStageError = (event: StageErrorEvent) => {
      const idx = stageIndexMap.get(event.stageName);
      if (idx === undefined) return;

      setState(prev => {
        const stages = [...prev.stages];
        stages[idx] = {
          ...stages[idx],
          status: 'error',
        };
        return {
          ...prev,
          stages,
          error: `Stage "${event.stageName}" failed: ${event.error.message}`,
        };
      });
    };

    const onPipelineComplete = (event: PipelineCompleteEvent) => {
      setState(prev => ({
        ...prev,
        done: true,
        totalCostUsd: event.totalCostUsd,
      }));
    };

    const onPipelineError = (event: PipelineErrorEvent) => {
      setState(prev => ({
        ...prev,
        error: event.error.message,
        done: true,
      }));
    };

    pipeline.on('stage:start', onStageStart);
    pipeline.on('stage:stream', onStageStream);
    pipeline.on('stage:complete', onStageComplete);
    pipeline.on('stage:error', onStageError);
    pipeline.on('pipeline:complete', onPipelineComplete);
    pipeline.on('pipeline:error', onPipelineError);

    // Start pipeline execution
    pipeline.run().catch(() => {
      // Errors are handled via pipeline:error event
    });

    return () => {
      pipeline.off('stage:start', onStageStart);
      pipeline.off('stage:stream', onStageStream);
      pipeline.off('stage:complete', onStageComplete);
      pipeline.off('stage:error', onStageError);
      pipeline.off('pipeline:complete', onPipelineComplete);
      pipeline.off('pipeline:error', onPipelineError);
    };
  }, [pipeline]);

  return state;
}
