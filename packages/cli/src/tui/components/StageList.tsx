import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { StageState } from '../types.js';

interface StageListProps {
  stages: StageState[];
  currentStageIndex: number;
}

function formatElapsed(ms: number | undefined): string {
  if (ms === undefined) return '';
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return '';
  return `$${cost.toFixed(2)}`;
}

function StatusIcon({ status }: { status: StageState['status'] }): React.ReactElement {
  switch (status) {
    case 'done':
      return <Text color="green">{'\u2713'}</Text>;
    case 'running':
      return <Text color="cyan"><Spinner type="dots" /></Text>;
    case 'error':
      return <Text color="red">{'\u2717'}</Text>;
    case 'pending':
    default:
      return <Text dimColor>{'\u25CB'}</Text>;
  }
}

function StageRow({ stage, isCurrent }: { stage: StageState; isCurrent: boolean }): React.ReactElement {
  const nameWidth = 14;
  const timeWidth = 6;
  const costWidth = 8;

  return (
    <Box gap={1}>
      <StatusIcon status={stage.status} />
      <Box width={nameWidth}>
        <Text bold={isCurrent}>{stage.name}</Text>
      </Box>
      <Box width={timeWidth} justifyContent="flex-end">
        <Text dimColor={stage.status === 'pending'}>
          {stage.status === 'running' ? formatElapsed(stage.elapsedMs) : formatElapsed(stage.elapsedMs)}
        </Text>
      </Box>
      <Box width={costWidth} justifyContent="flex-end">
        <Text dimColor={stage.status === 'pending'}>
          {formatCost(stage.costUsd)}
        </Text>
      </Box>
      <Box>
        <Text dimColor>{stage.model ?? ''}</Text>
      </Box>
      {isCurrent && stage.status === 'running' && (
        <Text color="yellow">{' \u2190 current'}</Text>
      )}
    </Box>
  );
}

export function StageList({ stages, currentStageIndex }: StageListProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold dimColor>Stages:</Text>
      {stages.map((stage, i) => (
        <StageRow key={stage.name} stage={stage} isCurrent={i === currentStageIndex} />
      ))}
    </Box>
  );
}
