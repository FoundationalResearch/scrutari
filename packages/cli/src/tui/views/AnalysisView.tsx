import React from 'react';
import { Box, Text, useApp } from 'ink';
import { useEffect } from 'react';
import { Header } from '../components/Header.js';
import { CostTrackerDisplay } from '../components/CostTracker.js';
import { StageList } from '../components/StageList.js';
import { StreamOutput } from '../components/StreamOutput.js';
import { usePipelineEvents } from '../hooks/usePipelineEvents.js';
import type { AnalysisProps } from '../types.js';

export function AnalysisView(props: AnalysisProps): React.ReactElement {
  const { exit } = useApp();
  const state = usePipelineEvents(
    props.ticker,
    props.skill,
    props.model,
    props.budgetUsd,
    props.stages,
    props.pipeline,
  );

  // Get live output from the current running stage
  const currentStage = state.stages[state.currentStageIndex];
  const liveLines = currentStage?.output ?? [];

  useEffect(() => {
    if (state.done || state.error) {
      // Small delay so the user sees the final state
      const timeout = setTimeout(() => exit(), 500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [state.done, state.error, exit]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Header ticker={state.ticker} skill={state.skill} model={state.model} />
      <CostTrackerDisplay spent={state.totalCostUsd} budget={state.budgetUsd} />
      <StageList stages={state.stages} currentStageIndex={state.currentStageIndex} />
      <StreamOutput lines={liveLines} />

      {state.done && !state.error && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            {'\u2713'} Analysis complete — total cost: ${state.totalCostUsd.toFixed(2)}
          </Text>
          {state.outputPath && (
            <Text dimColor>  Output saved to: {state.outputPath}</Text>
          )}
        </Box>
      )}

      {state.error && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>{'\u2717'} Error: {state.error}</Text>
        </Box>
      )}
    </Box>
  );
}
