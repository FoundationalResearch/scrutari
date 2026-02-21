import React from 'react';
import { Box, Text } from 'ink';
import type { PipelineEstimate } from '@scrutari/core';

export interface DryRunPreviewData {
  skillName: string;
  inputs: Record<string, unknown>;
  estimate: PipelineEstimate;
}

interface DryRunPreviewProps {
  data: DryRunPreviewData;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

export function DryRunPreview({ data }: DryRunPreviewProps): React.ReactElement {
  const { skillName, inputs, estimate } = data;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginTop={1}>
      <Text bold color="blue">Execution Preview (Dry Run)</Text>

      <Box marginTop={1} gap={1}>
        <Text>Skill:</Text>
        <Text bold>{skillName}</Text>
      </Box>

      {Object.keys(inputs).length > 0 && (
        <Box gap={1}>
          <Text dimColor>Inputs:</Text>
          <Text>{Object.entries(inputs).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}</Text>
        </Box>
      )}

      {estimate.executionLevels.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Execution DAG:</Text>
          {estimate.executionLevels.map((level, i) => (
            <Box key={i} marginLeft={2} gap={1}>
              <Text dimColor>Level {i + 1}:</Text>
              <Text>{level.join(' + ')}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold dimColor>Stages:</Text>
        {estimate.stages.map((stage) => (
          <Box key={stage.stageName} gap={1} marginLeft={2}>
            <Text>{stage.stageName}</Text>
            <Text dimColor>({stage.model})</Text>
            <Text color="yellow">${stage.estimatedCostUsd.toFixed(4)}</Text>
            <Text dimColor>{formatTime(stage.estimatedTimeSeconds)}</Text>
          </Box>
        ))}
      </Box>

      {estimate.toolsRequired.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Tools required: </Text>
          <Text>{estimate.toolsRequired.join(', ')}</Text>
        </Box>
      )}
      {estimate.toolsOptional.length > 0 && (
        <Box>
          <Text dimColor>Tools optional: </Text>
          <Text>{estimate.toolsOptional.join(', ')}</Text>
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        <Box gap={1}>
          <Text>Estimated cost:</Text>
          <Text bold color="yellow">${estimate.totalEstimatedCostUsd.toFixed(4)}</Text>
        </Box>
        <Box gap={1}>
          <Text>Estimated time:</Text>
          <Text bold>{formatTime(estimate.totalEstimatedTimeSeconds)}</Text>
        </Box>
      </Box>
    </Box>
  );
}
