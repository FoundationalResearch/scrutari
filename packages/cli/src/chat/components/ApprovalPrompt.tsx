import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { PipelineEstimate } from '@scrutari/core';
import { formatTime } from './DryRunPreview.js';

interface ApprovalPromptProps {
  estimate: PipelineEstimate;
  onApprove: () => void;
  onDeny: () => void;
}

export function ApprovalPrompt({ estimate, onApprove, onDeny }: ApprovalPromptProps): React.ReactElement {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onApprove();
    } else if (input === 'n' || input === 'N') {
      onDeny();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginTop={1}>
      <Text bold color="blue">Pipeline Approval Required</Text>
      <Box marginTop={1}>
        <Text>Skill: </Text>
        <Text bold>{estimate.skillName}</Text>
      </Box>
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
      <Box marginTop={1} gap={2}>
        <Text bold color="green">[Y] Approve</Text>
        <Text bold color="red">[N] Cancel</Text>
      </Box>
    </Box>
  );
}
