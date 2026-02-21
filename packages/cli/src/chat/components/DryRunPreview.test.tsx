import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { DryRunPreview, formatTime } from './DryRunPreview.js';
import type { DryRunPreviewData } from '../types.js';
import type { PipelineEstimate } from '@scrutari/core';

function makeEstimate(overrides: Partial<PipelineEstimate> = {}): PipelineEstimate {
  return {
    skillName: 'deep-dive',
    stages: [
      {
        stageName: 'gather',
        model: 'claude-sonnet-4-20250514',
        agentType: 'explore',
        estimatedInputTokens: 4096,
        estimatedOutputTokens: 2048,
        estimatedCostUsd: 0.04,
        estimatedTimeSeconds: 27.6,
        tools: ['edgar'],
      },
      {
        stageName: 'analyze',
        model: 'claude-sonnet-4-20250514',
        agentType: 'default',
        estimatedInputTokens: 8192,
        estimatedOutputTokens: 4096,
        estimatedCostUsd: 0.08,
        estimatedTimeSeconds: 53.2,
        tools: [],
      },
    ],
    executionLevels: [['gather'], ['analyze']],
    totalEstimatedCostUsd: 0.12,
    totalEstimatedTimeSeconds: 80.8,
    toolsRequired: ['edgar'],
    toolsOptional: ['news'],
    ...overrides,
  };
}

function makeData(overrides: Partial<DryRunPreviewData> = {}): DryRunPreviewData {
  return {
    skillName: 'deep-dive',
    inputs: { ticker: 'NVDA' },
    estimate: makeEstimate(),
    ...overrides,
  };
}

describe('formatTime', () => {
  it('formats seconds under 60', () => {
    expect(formatTime(28)).toBe('~28s');
  });

  it('formats exactly 60 seconds as 1 minute', () => {
    expect(formatTime(60)).toBe('~1m');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(80)).toBe('~1m 20s');
  });

  it('formats large values', () => {
    expect(formatTime(150)).toBe('~2m 30s');
  });

  it('rounds fractional seconds', () => {
    expect(formatTime(27.6)).toBe('~28s');
  });
});

describe('DryRunPreview', () => {
  it('renders skill name', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('deep-dive');
  });

  it('renders inputs', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('ticker');
    expect(lastFrame()).toContain('NVDA');
  });

  it('renders execution DAG levels', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('Level 1');
    expect(lastFrame()).toContain('gather');
    expect(lastFrame()).toContain('Level 2');
    expect(lastFrame()).toContain('analyze');
  });

  it('renders stage details', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('gather');
    expect(lastFrame()).toContain('analyze');
    expect(lastFrame()).toContain('$0.0400');
    expect(lastFrame()).toContain('$0.0800');
  });

  it('renders total cost and time', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('$0.1200');
    expect(lastFrame()).toContain('~1m 21s');
  });

  it('renders tools required', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('Tools required');
    expect(lastFrame()).toContain('edgar');
  });

  it('renders tools optional', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('Tools optional');
    expect(lastFrame()).toContain('news');
  });

  it('renders parallel stages with + separator in DAG', () => {
    const data = makeData({
      estimate: makeEstimate({
        executionLevels: [['gather', 'search'], ['analyze']],
      }),
    });
    const { lastFrame } = render(<DryRunPreview data={data} />);
    expect(lastFrame()).toContain('gather + search');
  });

  it('renders header text', () => {
    const { lastFrame } = render(<DryRunPreview data={makeData()} />);
    expect(lastFrame()).toContain('Execution Preview');
  });
});
