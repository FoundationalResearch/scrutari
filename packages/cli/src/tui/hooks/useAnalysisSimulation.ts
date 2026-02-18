import { useState, useEffect, useCallback } from 'react';
import type { AnalysisState, StageState } from '../types.js';

const MOCK_OUTPUTS: Record<string, string[]> = {
  gather: [
    'Fetching SEC filings from EDGAR...',
    'Retrieved 10-K annual report (2024)',
    'Retrieved 10-Q quarterly report (Q3 2024)',
    'Fetching market data...',
    'Retrieved price history (1Y)',
    'Retrieved options chain data',
  ],
  extract: [
    'Parsing financial statements...',
    'Extracted revenue: $35.1B (+122% YoY)',
    'Extracted gross margin: 78.4%',
    'Extracted operating income: $23.3B',
    'Extracted free cash flow: $15.2B',
  ],
  analyze: [
    'Revenue grew 122% YoY driven by data center demand...',
    'Gross margin expanded to 78.4%, up from 56.9%...',
    'Data center segment now represents 83% of total revenue...',
    'Gaming segment showed modest 9% growth...',
    'Operating leverage remains strong with OpEx ratio declining...',
    'R&D investment accelerating: $8.7B annual run rate...',
  ],
  verify: [
    'Cross-referencing claims with source filings...',
    'Verified: revenue figure matches 10-K page 42',
    'Verified: margin calculation consistent',
    'Verified: segment breakdown matches earnings call transcript',
  ],
  synthesize: [
    'Generating investment thesis...',
    'Key finding: AI infrastructure demand driving hypergrowth',
    'Risk factor: customer concentration in cloud providers',
    'Valuation: trading at 35x forward earnings',
    'Recommendation: Strong competitive moat in AI accelerators',
  ],
  format: [
    'Formatting output as markdown...',
    'Adding charts and tables...',
    'Writing final report...',
  ],
};

const MOCK_MODELS: Record<string, string> = {
  gather: 'claude-haiku-3-5-20241022',
  extract: 'claude-haiku-3-5-20241022',
  analyze: 'claude-sonnet-4-20250514',
  verify: 'claude-sonnet-4-20250514',
  synthesize: 'claude-sonnet-4-20250514',
  format: 'claude-haiku-3-5-20241022',
};

const MOCK_COSTS: Record<string, number> = {
  gather: 0.02,
  extract: 0.01,
  analyze: 0.06,
  verify: 0.03,
  synthesize: 0.04,
  format: 0.01,
};

const STAGE_DURATION_MS = 2500;
const LINE_INTERVAL_MS = 400;

export function useAnalysisSimulation(
  ticker: string,
  skill: string,
  model: string,
  budgetUsd: number,
  stageNames: string[],
): AnalysisState {
  const makeInitialStages = useCallback((): StageState[] =>
    stageNames.map(name => ({
      name,
      status: 'pending' as const,
      model: MOCK_MODELS[name] ?? model,
      output: [],
    })), [stageNames, model]);

  const [state, setState] = useState<AnalysisState>(() => ({
    ticker,
    skill,
    model,
    budgetUsd,
    totalCostUsd: 0,
    stages: makeInitialStages(),
    currentStageIndex: 0,
    done: false,
  }));

  useEffect(() => {
    let cancelled = false;
    let stageTimeout: ReturnType<typeof setTimeout>;
    let lineInterval: ReturnType<typeof setInterval>;
    let stageStartTime = Date.now();

    function startStage(stageIndex: number) {
      if (cancelled || stageIndex >= stageNames.length) {
        setState(prev => ({ ...prev, done: true }));
        return;
      }

      const stageName = stageNames[stageIndex];
      const lines = MOCK_OUTPUTS[stageName] ?? ['Processing...'];
      let lineIndex = 0;
      stageStartTime = Date.now();

      // Mark stage as running
      setState(prev => {
        const stages = [...prev.stages];
        stages[stageIndex] = {
          ...stages[stageIndex],
          status: 'running',
          elapsedMs: 0,
          output: [],
        };
        return { ...prev, stages, currentStageIndex: stageIndex };
      });

      // Stream output lines
      lineInterval = setInterval(() => {
        if (cancelled) return;
        if (lineIndex < lines.length) {
          setState(prev => {
            const stages = [...prev.stages];
            stages[stageIndex] = {
              ...stages[stageIndex],
              elapsedMs: Date.now() - stageStartTime,
              output: [...(stages[stageIndex].output ?? []), lines[lineIndex]],
            };
            return { ...prev, stages };
          });
          lineIndex++;
        }
      }, LINE_INTERVAL_MS);

      // Complete stage after duration
      stageTimeout = setTimeout(() => {
        if (cancelled) return;
        clearInterval(lineInterval);

        const cost = MOCK_COSTS[stageName] ?? 0.01;
        setState(prev => {
          const stages = [...prev.stages];
          stages[stageIndex] = {
            ...stages[stageIndex],
            status: 'done',
            elapsedMs: Date.now() - stageStartTime,
            costUsd: cost,
            output: lines,
          };
          return {
            ...prev,
            stages,
            totalCostUsd: prev.totalCostUsd + cost,
          };
        });

        // Start next stage
        startStage(stageIndex + 1);
      }, STAGE_DURATION_MS);
    }

    startStage(0);

    return () => {
      cancelled = true;
      clearTimeout(stageTimeout);
      clearInterval(lineInterval);
    };
  }, [stageNames, model]);

  return state;
}
