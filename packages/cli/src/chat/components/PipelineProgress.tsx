import React from 'react';
import { Box, Text } from 'ink';
import { StageList } from '../../tui/components/StageList.js';
import { CostTrackerDisplay } from '../../tui/components/CostTracker.js';
import type { PipelineRunState } from '../types.js';

interface PipelineProgressProps {
  state: PipelineRunState;
}

export function PipelineProgress({ state }: PipelineProgressProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginLeft={2} marginY={0} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box gap={2} marginBottom={0}>
        <Text dimColor>Pipeline:</Text>
        <Text bold>{state.ticker}</Text>
        <Text dimColor>({state.skill})</Text>
      </Box>
      <StageList stages={state.stages} currentStageIndex={state.currentStageIndex} />
      <CostTrackerDisplay spent={state.totalCostUsd} budget={5.0} />
      {state.done && !state.error && (
        <Text color="green">{'\u2713'} Pipeline complete — ${state.totalCostUsd.toFixed(2)}</Text>
      )}
      {state.error && (
        <Text color="red">{'\u2717'} {state.error}</Text>
      )}
    </Box>
  );
}
