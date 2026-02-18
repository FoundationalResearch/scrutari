import { describe, it, expect } from 'vitest';
import { formatJson, type JsonFormatOptions } from './json.js';
import type { Skill } from '../skills/types.js';
import type { VerificationReport } from '../verification/types.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'deep-dive',
    version: '1.0',
    description: 'A deep dive analysis',
    stages: [
      { name: 'gather', prompt: 'Gather data' },
      { name: 'analyze', prompt: 'Analyze data', input_from: ['gather'] },
    ],
    output: { primary: 'analyze' },
    ...overrides,
  };
}

function makeOptions(overrides: Partial<JsonFormatOptions> = {}): JsonFormatOptions {
  return {
    primaryOutput: '## Executive Summary\n\nNVDA is performing well.\n\n## Details\n\nMore info.',
    outputs: { gather: 'raw data', analyze: 'analysis text' },
    inputs: { ticker: 'NVDA' },
    skill: makeSkill(),
    ...overrides,
  };
}

describe('formatJson', () => {
  it('produces valid JSON string', () => {
    const result = formatJson(makeOptions());
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('includes metadata with skill and ticker', () => {
    const result = JSON.parse(formatJson(makeOptions()));
    expect(result.metadata.skill).toBe('deep-dive');
    expect(result.metadata.ticker).toBe('NVDA');
    expect(result.metadata.date).toBeDefined();
  });

  it('includes skill version in metadata', () => {
    const result = JSON.parse(formatJson(makeOptions()));
    expect(result.metadata.skillVersion).toBe('1.0');
  });

  it('includes model in metadata when provided', () => {
    const result = JSON.parse(formatJson(makeOptions({ model: 'claude-sonnet-4-20250514' })));
    expect(result.metadata.model).toBe('claude-sonnet-4-20250514');
  });

  it('includes cost rounded to 4 decimals', () => {
    const result = JSON.parse(formatJson(makeOptions({ totalCostUsd: 0.472345 })));
    expect(result.metadata.cost).toBe(0.4723);
  });

  it('includes duration with formatted string', () => {
    const result = JSON.parse(formatJson(makeOptions({ totalDurationMs: 12500 })));
    expect(result.metadata.durationMs).toBe(12500);
    expect(result.metadata.durationFormatted).toBe('12.5s');
  });

  it('extracts executive summary as summary field', () => {
    const result = JSON.parse(formatJson(makeOptions()));
    expect(result.summary).toContain('NVDA is performing well');
  });

  it('falls back to first paragraph when no executive summary', () => {
    const result = JSON.parse(formatJson(makeOptions({
      primaryOutput: '# Report\n\nThis is the first paragraph.\n\nThis is the second.',
    })));
    expect(result.summary).toContain('This is the first paragraph');
  });

  it('includes all stage outputs', () => {
    const result = JSON.parse(formatJson(makeOptions()));
    expect(result.stages.gather.output).toBe('raw data');
    expect(result.stages.analyze.output).toBe('analysis text');
  });

  it('includes per-stage usage data when provided', () => {
    const result = JSON.parse(formatJson(makeOptions({
      stageUsage: {
        gather: { inputTokens: 100, outputTokens: 500, costUsd: 0.01, model: 'haiku', durationMs: 1000 },
      },
    })));
    expect(result.stages.gather.usage).toBeDefined();
    expect(result.stages.gather.usage.inputTokens).toBe(100);
    expect(result.stages.gather.usage.costUsd).toBe(0.01);
  });

  it('includes verification summary when provided', () => {
    const verification: VerificationReport = {
      claims: [{
        id: 'claim-1',
        text: 'Revenue was $50B',
        category: 'metric',
        status: 'verified',
        confidence: 0.9,
        sources: [{
          sourceId: 'stage:gather',
          label: 'gather output',
          stage: 'gather',
          excerpt: 'Revenue data.',
        }],
        reasoning: 'Matched.',
      }],
      summary: {
        totalClaims: 1,
        verified: 1,
        unverified: 0,
        disputed: 0,
        errors: 0,
        overallConfidence: 0.9,
      },
      analysisText: '',
      annotatedText: '',
      footnotes: {},
    };

    const result = JSON.parse(formatJson(makeOptions({ verification })));
    expect(result.verification.total).toBe(1);
    expect(result.verification.verified).toBe(1);
    expect(result.verification.overallConfidence).toBe(0.9);
  });

  it('includes serialized claims when verification provided', () => {
    const verification: VerificationReport = {
      claims: [{
        id: 'claim-1',
        text: 'Revenue was $50B',
        category: 'metric',
        status: 'verified',
        confidence: 0.9,
        sources: [{
          sourceId: 'stage:gather',
          label: 'gather output',
          stage: 'gather',
          excerpt: 'Revenue data.',
        }],
        reasoning: 'Matched in source.',
      }],
      summary: {
        totalClaims: 1,
        verified: 1,
        unverified: 0,
        disputed: 0,
        errors: 0,
        overallConfidence: 0.9,
      },
      analysisText: '',
      annotatedText: '',
      footnotes: {},
    };

    const result = JSON.parse(formatJson(makeOptions({ verification })));
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].id).toBe('claim-1');
    expect(result.claims[0].status).toBe('verified');
    expect(result.claims[0].reasoning).toBe('Matched in source.');
    expect(result.claims[0].sources[0].label).toBe('gather output');
    // Source excerpt should NOT be in JSON claims (only sourceId, label, stage)
    expect(result.claims[0].sources[0].excerpt).toBeUndefined();
  });

  it('omits verification when not provided', () => {
    const result = JSON.parse(formatJson(makeOptions()));
    expect(result.verification).toBeUndefined();
    expect(result.claims).toBeUndefined();
  });

  it('omits verification when claims array is empty', () => {
    const verification: VerificationReport = {
      claims: [],
      summary: { totalClaims: 0, verified: 0, unverified: 0, disputed: 0, errors: 0, overallConfidence: 0 },
      analysisText: '',
      annotatedText: '',
      footnotes: {},
    };

    const result = JSON.parse(formatJson(makeOptions({ verification })));
    expect(result.verification).toBeUndefined();
    expect(result.claims).toBeUndefined();
  });

  it('handles missing ticker gracefully', () => {
    const result = JSON.parse(formatJson(makeOptions({ inputs: { depth: 'deep' } })));
    expect(result.metadata.ticker).toBeUndefined();
    expect(result.metadata.skill).toBe('deep-dive');
  });
});
