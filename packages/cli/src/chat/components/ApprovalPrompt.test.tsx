import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ApprovalPrompt } from './ApprovalPrompt.js';
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
    toolsOptional: [],
    ...overrides,
  };
}

describe('ApprovalPrompt', () => {
  it('renders skill name', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('deep-dive');
  });

  it('renders execution DAG', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('Execution DAG');
    expect(lastFrame()).toContain('Level 1');
    expect(lastFrame()).toContain('Level 2');
  });

  it('renders stage details with time estimates', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('gather');
    expect(lastFrame()).toContain('analyze');
    expect(lastFrame()).toContain('$0.0400');
    expect(lastFrame()).toContain('~28s');
  });

  it('renders total cost and time', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('$0.1200');
    expect(lastFrame()).toContain('~1m 21s');
  });

  it('renders Y/N options', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('[Y] Approve');
    expect(lastFrame()).toContain('[N] Cancel');
  });

  it('calls onApprove when Y is pressed', async () => {
    const onApprove = vi.fn();
    const { stdin } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={onApprove} onDeny={vi.fn()} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('y');
    await new Promise(r => setTimeout(r, 50));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onDeny when N is pressed', async () => {
    const onDeny = vi.fn();
    const { stdin } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={onDeny} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('n');
    await new Promise(r => setTimeout(r, 50));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('renders tools required', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('Tools required');
    expect(lastFrame()).toContain('edgar');
  });

  it('renders parallel stages in DAG', () => {
    const estimate = makeEstimate({
      executionLevels: [['gather', 'search'], ['analyze']],
    });
    const { lastFrame } = render(
      <ApprovalPrompt estimate={estimate} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('gather + search');
  });

  it('renders header', () => {
    const { lastFrame } = render(
      <ApprovalPrompt estimate={makeEstimate()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(lastFrame()).toContain('Pipeline Approval Required');
  });
});
