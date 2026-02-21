import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SkillSummary, PipelineEstimate } from '@scrutari/core';

export interface SkillDetail {
  name: string;
  description: string;
  source: 'built-in' | 'user';
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: unknown;
    description?: string;
  }>;
  stages: Array<{
    name: string;
    model?: string;
    description?: string;
    tools?: string[];
    input_from?: string[];
  }>;
  estimate: PipelineEstimate;
}

interface SkillBrowserProps {
  summaries: SkillSummary[];
  onSelect: (command: string) => void;
  onClose: () => void;
  loadDetail: (name: string) => Promise<SkillDetail | null>;
}

type View = 'list' | 'detail';

export function SkillBrowser({ summaries, onSelect, onClose, loadDetail }: SkillBrowserProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<View>('list');
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoadDetail = useCallback(async () => {
    if (summaries.length === 0) return;
    setLoading(true);
    const d = await loadDetail(summaries[selectedIndex].name);
    setDetail(d);
    setView('detail');
    setLoading(false);
  }, [summaries, selectedIndex, loadDetail]);

  useInput((input, key) => {
    if (view === 'list') {
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(summaries.length - 1, prev + 1));
      } else if (key.return) {
        handleLoadDetail();
      } else if (input === 'q' || input === 'Q') {
        onClose();
      }
    } else if (view === 'detail') {
      if (key.escape || input === 'q' || input === 'Q') {
        setView('list');
        setDetail(null);
      } else if (key.return && detail) {
        onSelect(`Run the ${detail.name} skill`);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
        <Text color="blue" bold>Skills Browser</Text>
        <Text dimColor>Loading skill details...</Text>
      </Box>
    );
  }

  if (view === 'detail' && detail) {
    return <DetailView detail={detail} />;
  }

  return <ListView summaries={summaries} selectedIndex={selectedIndex} />;
}

function ListView({ summaries, selectedIndex }: { summaries: SkillSummary[]; selectedIndex: number }): React.ReactElement {
  if (summaries.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
        <Text color="blue" bold>Skills Browser</Text>
        <Text dimColor>No skills found.</Text>
        <Text dimColor>q: Close</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
      <Text color="blue" bold>Skills Browser</Text>
      <Box flexDirection="column" marginTop={1}>
        {summaries.map((s, i) => (
          <Box key={s.name}>
            <Text color={i === selectedIndex ? 'blue' : undefined} bold={i === selectedIndex}>
              {i === selectedIndex ? '\u25b8 ' : '  '}
              {s.name}
            </Text>
            <Text dimColor> — {s.description}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ Navigate  Enter: Details  q: Close</Text>
      </Box>
    </Box>
  );
}

function DetailView({ detail }: { detail: SkillDetail }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
      <Box gap={1}>
        <Text color="blue" bold>{detail.name}</Text>
        <Text dimColor>({detail.source})</Text>
      </Box>
      <Text>{detail.description}</Text>

      {detail.inputs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Inputs:</Text>
          {detail.inputs.map(inp => (
            <Box key={inp.name} marginLeft={2}>
              <Text bold>{inp.name}</Text>
              <Text dimColor> ({inp.type}{inp.required ? ', required' : ''})</Text>
              {inp.default !== undefined && <Text dimColor> default: {String(inp.default)}</Text>}
              {inp.description && <Text dimColor> — {inp.description}</Text>}
            </Box>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold dimColor>Stages:</Text>
        {detail.stages.map((st, i) => (
          <Box key={st.name} marginLeft={2} gap={1}>
            <Text>{i + 1}.</Text>
            <Text bold>{st.name}</Text>
            {st.model && <Text dimColor>({st.model})</Text>}
            {st.tools && st.tools.length > 0 && <Text dimColor>[{st.tools.join(', ')}]</Text>}
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold dimColor>Execution Levels:</Text>
        {detail.estimate.executionLevels.map((level, i) => (
          <Box key={i} marginLeft={2}>
            <Text dimColor>L{i + 1}: </Text>
            <Text>{level.join(', ')}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text>Estimated cost: </Text>
        <Text bold color="yellow">${detail.estimate.totalEstimatedCostUsd.toFixed(4)}</Text>
      </Box>

      {detail.estimate.toolsRequired.length > 0 && (
        <Box>
          <Text dimColor>Tools required: </Text>
          <Text>{detail.estimate.toolsRequired.join(', ')}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter: Run  Esc/q: Back</Text>
      </Box>
    </Box>
  );
}
