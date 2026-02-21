import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimatePipelineCost, estimateStageTime } from './estimator.js';
import { parseSkillFile } from '../skills/loader.js';
import type { Skill } from '../skills/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(__dirname, '..', '..', '..', '..', 'skills');

function makeSimpleSkill(overrides?: Partial<Skill>): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    stages: [
      {
        name: 'gather',
        prompt: 'Gather data about {ticker}',
        tools: ['edgar'],
      },
    ],
    output: { primary: 'gather' },
    ...overrides,
  };
}

describe('estimatePipelineCost', () => {
  it('estimates a single-stage skill', () => {
    const skill = makeSimpleSkill();
    const estimate = estimatePipelineCost(skill);

    expect(estimate.skillName).toBe('test-skill');
    expect(estimate.stages).toHaveLength(1);
    expect(estimate.stages[0].stageName).toBe('gather');
    expect(estimate.stages[0].tools).toEqual(['edgar']);
    expect(estimate.stages[0].estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.stages[0].estimatedOutputTokens).toBeGreaterThan(0);
    expect(estimate.stages[0].estimatedInputTokens).toBe(estimate.stages[0].estimatedOutputTokens * 2);
    expect(estimate.totalEstimatedCostUsd).toBe(estimate.stages[0].estimatedCostUsd);
    expect(estimate.executionLevels).toEqual([['gather']]);
  });

  it('estimates a multi-stage skill from deep-dive.pipeline.yaml', () => {
    const skill = parseSkillFile(resolve(skillsDir, 'deep-dive.pipeline.yaml'));
    const estimate = estimatePipelineCost(skill);

    expect(estimate.skillName).toBe('deep-dive');
    expect(estimate.stages.length).toBeGreaterThan(1);
    expect(estimate.totalEstimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.executionLevels.length).toBeGreaterThanOrEqual(1);

    // Total should equal sum of stages
    const sumOfStages = estimate.stages.reduce((s, st) => s + st.estimatedCostUsd, 0);
    expect(estimate.totalEstimatedCostUsd).toBeCloseTo(sumOfStages, 10);
  });

  it('applies model override to all stages', () => {
    const skill = makeSimpleSkill({
      stages: [
        { name: 'a', prompt: 'do a', tools: [] },
        { name: 'b', prompt: 'do b', input_from: ['a'], tools: [] },
      ],
      output: { primary: 'b' },
    });

    const withDefault = estimatePipelineCost(skill);
    const withOverride = estimatePipelineCost(skill, 'gpt-4o');

    expect(withOverride.stages[0].model).toBe('gpt-4o');
    expect(withOverride.stages[1].model).toBe('gpt-4o');
    // Different model, different pricing
    expect(withOverride.totalEstimatedCostUsd).not.toEqual(withDefault.totalEstimatedCostUsd);
  });

  it('respects agent config overrides', () => {
    const skill = makeSimpleSkill();
    const withDefault = estimatePipelineCost(skill);
    const withOverride = estimatePipelineCost(skill, undefined, {
      explore: { maxTokens: 512 },
    });

    // The gather stage (no input_from, has tools) resolves to 'explore' agent type
    expect(withOverride.stages[0].agentType).toBe('explore');
    expect(withOverride.stages[0].estimatedOutputTokens).toBe(512);
    expect(withOverride.totalEstimatedCostUsd).toBeLessThan(withDefault.totalEstimatedCostUsd);
  });

  it('returns correct execution levels for parallel stages', () => {
    const skill = makeSimpleSkill({
      stages: [
        { name: 'a', prompt: 'do a', tools: [] },
        { name: 'b', prompt: 'do b', tools: [] },
        { name: 'c', prompt: 'do c', input_from: ['a', 'b'], tools: [] },
      ],
      output: { primary: 'c' },
    });

    const estimate = estimatePipelineCost(skill);
    expect(estimate.executionLevels).toEqual([['a', 'b'], ['c']]);
  });

  it('includes tools_required and tools_optional', () => {
    const skill = makeSimpleSkill({
      tools_required: ['edgar'],
      tools_optional: ['news'],
    });

    const estimate = estimatePipelineCost(skill);
    expect(estimate.toolsRequired).toEqual(['edgar']);
    expect(estimate.toolsOptional).toEqual(['news']);
  });

  it('defaults to empty arrays when no tools declared', () => {
    const skill = makeSimpleSkill();
    const estimate = estimatePipelineCost(skill);
    expect(estimate.toolsRequired).toEqual([]);
    expect(estimate.toolsOptional).toEqual([]);
  });

  it('estimates sub_pipeline stages recursively', () => {
    const parentSkill = {
      name: 'parent',
      description: 'Parent skill',
      stages: [
        { name: 'delegate', sub_pipeline: 'child' },
      ],
      output: { primary: 'delegate' },
    };

    const childSkill = {
      name: 'child',
      description: 'Child skill',
      stages: [
        { name: 'inner', prompt: 'Do inner work' },
      ],
      output: { primary: 'inner' },
    };

    const loadSkill = (name: string) => {
      if (name === 'child') return { skill: childSkill, filePath: '/test/child.yaml', source: 'built-in' as const };
      return undefined;
    };

    const estimate = estimatePipelineCost(parentSkill as any, undefined, undefined, loadSkill);
    expect(estimate.stages).toHaveLength(1);
    expect(estimate.stages[0].stageName).toBe('delegate/inner');
    expect(estimate.totalEstimatedCostUsd).toBeGreaterThan(0);
  });

  it('falls back to default estimate when sub_pipeline skill not found', () => {
    const skill = {
      name: 'parent',
      description: 'Parent',
      stages: [
        { name: 'delegate', sub_pipeline: 'missing' },
      ],
      output: { primary: 'delegate' },
    };

    const loadSkill = () => undefined;
    const estimate = estimatePipelineCost(skill as any, undefined, undefined, loadSkill);
    // Should have one stage (fallback estimate for the missing sub-pipeline)
    expect(estimate.stages).toHaveLength(1);
    expect(estimate.stages[0].stageName).toBe('delegate');
  });

  it('works without loadSkill param (backward compatible)', () => {
    const skill = {
      name: 'parent',
      description: 'Parent',
      stages: [
        { name: 'normal', prompt: 'Do something' },
      ],
      output: { primary: 'normal' },
    };

    const estimate = estimatePipelineCost(skill as any);
    expect(estimate.stages).toHaveLength(1);
    expect(estimate.totalEstimatedCostUsd).toBeGreaterThan(0);
  });

  it('includes estimatedTimeSeconds for each stage', () => {
    const skill = makeSimpleSkill();
    const estimate = estimatePipelineCost(skill);

    expect(estimate.stages[0].estimatedTimeSeconds).toBeGreaterThan(0);
    // Time should be at least the base latency (2s)
    expect(estimate.stages[0].estimatedTimeSeconds).toBeGreaterThanOrEqual(2);
  });

  it('totalEstimatedTimeSeconds accounts for parallel levels', () => {
    const skill = makeSimpleSkill({
      stages: [
        { name: 'a', prompt: 'do a', tools: [] },
        { name: 'b', prompt: 'do b', tools: [] },
        { name: 'c', prompt: 'do c', input_from: ['a', 'b'], tools: [] },
      ],
      output: { primary: 'c' },
    });

    const estimate = estimatePipelineCost(skill);
    // Execution levels: [['a', 'b'], ['c']]
    // Parallel stages a,b should use max (not sum), then add c
    const timeA = estimate.stages.find(s => s.stageName === 'a')!.estimatedTimeSeconds;
    const timeB = estimate.stages.find(s => s.stageName === 'b')!.estimatedTimeSeconds;
    const timeC = estimate.stages.find(s => s.stageName === 'c')!.estimatedTimeSeconds;

    // Since a and b have same config, they should have same time
    expect(timeA).toBe(timeB);
    // Total = max(a,b) + c, not a + b + c
    expect(estimate.totalEstimatedTimeSeconds).toBeCloseTo(Math.max(timeA, timeB) + timeC, 5);
  });

  it('time estimate varies by model speed', () => {
    const skill = makeSimpleSkill();

    // Haiku is faster (~100 tok/s) than Sonnet (~80 tok/s)
    const withHaiku = estimatePipelineCost(skill, 'claude-haiku-3-5-20241022');
    const withSonnet = estimatePipelineCost(skill, 'claude-sonnet-4-20250514');

    // Same output tokens, different speed → Haiku should be faster
    expect(withHaiku.stages[0].estimatedTimeSeconds).toBeLessThan(withSonnet.stages[0].estimatedTimeSeconds);
  });
});

describe('estimateStageTime', () => {
  it('returns base latency plus token generation time', () => {
    // Haiku: 100 tok/s, 1000 tokens → 2 + 10 = 12s
    expect(estimateStageTime('claude-haiku-3-5-20241022', 1000)).toBeCloseTo(12, 5);
  });

  it('uses default speed for unknown models', () => {
    // Default: 60 tok/s, 600 tokens → 2 + 10 = 12s
    expect(estimateStageTime('unknown-model', 600)).toBeCloseTo(12, 5);
  });
});
