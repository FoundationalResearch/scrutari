import { describe, it, expect } from 'vitest';
import { formatMarkdown, type MarkdownFormatOptions } from './markdown.js';
import type { Skill } from '../skills/types.js';
import type { VerificationReport } from '../verification/types.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'deep-dive',
    description: 'A deep dive analysis',
    stages: [
      { name: 'gather', prompt: 'Gather data' },
      { name: 'analyze', prompt: 'Analyze data', input_from: ['gather'] },
    ],
    output: { primary: 'analyze' },
    ...overrides,
  };
}

function makeOptions(overrides: Partial<MarkdownFormatOptions> = {}): MarkdownFormatOptions {
  return {
    primaryOutput: '# NVDA Analysis\n\n## Executive Summary\n\nNVDA is performing well.\n\n## Financial Metrics\n\nRevenue was $50 billion.',
    outputs: { gather: 'raw data', analyze: 'analysis' },
    inputs: { ticker: 'NVDA' },
    skill: makeSkill(),
    ...overrides,
  };
}

function makeVerification(): VerificationReport {
  return {
    claims: [
      {
        id: 'claim-1',
        text: 'Revenue was $50 billion',
        category: 'metric',
        status: 'verified',
        confidence: 0.9,
        sources: [{
          sourceId: 'stage:gather',
          label: 'gather stage output',
          stage: 'gather',
          excerpt: 'Revenue data.',
        }],
        reasoning: 'Numeric value matched.',
      },
      {
        id: 'claim-2',
        text: 'NVDA is performing well',
        category: 'general',
        status: 'unverified',
        confidence: 0,
        sources: [],
      },
    ],
    summary: {
      totalClaims: 2,
      verified: 1,
      unverified: 1,
      disputed: 0,
      errors: 0,
      overallConfidence: 0.45,
    },
    analysisText: 'Revenue was $50 billion.',
    annotatedText: 'Revenue was $50 billion.',
    footnotes: {},
  };
}

describe('formatMarkdown', () => {
  it('produces YAML frontmatter with ticker and skill', () => {
    const result = formatMarkdown(makeOptions());
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('ticker: NVDA');
    expect(result).toContain('skill: deep-dive');
    expect(result).toContain('date:');
    expect(result).toMatch(/---\n/);
  });

  it('includes model in frontmatter when provided', () => {
    const result = formatMarkdown(makeOptions({ model: 'claude-sonnet-4-20250514' }));
    expect(result).toContain('model: claude-sonnet-4-20250514');
  });

  it('includes cost in frontmatter when provided', () => {
    const result = formatMarkdown(makeOptions({ totalCostUsd: 0.47 }));
    expect(result).toContain('cost: $0.47');
  });

  it('includes verified claims count in frontmatter', () => {
    const result = formatMarkdown(makeOptions({ verification: makeVerification() }));
    expect(result).toContain('verified_claims: 1/2');
  });

  it('contains the primary output content', () => {
    const result = formatMarkdown(makeOptions());
    expect(result).toContain('# NVDA Analysis');
    expect(result).toContain('Revenue was $50 billion');
  });

  it('contains execution details section', () => {
    const result = formatMarkdown(makeOptions({
      model: 'claude-sonnet-4-20250514',
      totalCostUsd: 0.47,
      totalDurationMs: 12500,
    }));
    expect(result).toContain('## Execution Details');
    expect(result).toContain('| Skill | deep-dive |');
    expect(result).toContain('| Model | claude-sonnet-4-20250514 |');
    expect(result).toContain('| Total Cost | $0.4700 |');
    expect(result).toContain('| Duration | 12.5s |');
  });

  it('formats duration correctly', () => {
    // Less than a second
    let result = formatMarkdown(makeOptions({ totalDurationMs: 500 }));
    expect(result).toContain('500ms');

    // Seconds
    result = formatMarkdown(makeOptions({ totalDurationMs: 5500 }));
    expect(result).toContain('5.5s');

    // Minutes
    result = formatMarkdown(makeOptions({ totalDurationMs: 95000 }));
    expect(result).toContain('1m 35s');
  });

  it('includes per-stage usage table', () => {
    const result = formatMarkdown(makeOptions({
      stageUsage: {
        gather: { inputTokens: 100, outputTokens: 500, costUsd: 0.01, model: 'claude-haiku-3-5-20241022' },
        analyze: { inputTokens: 600, outputTokens: 2000, costUsd: 0.05, model: 'claude-sonnet-4-20250514' },
      },
    }));
    expect(result).toContain('### Stage Details');
    expect(result).toContain('| gather |');
    expect(result).toContain('| analyze |');
    expect(result).toContain('claude-haiku');
    expect(result).toContain('claude-sonnet');
  });

  it('includes verification summary section', () => {
    const result = formatMarkdown(makeOptions({ verification: makeVerification() }));
    expect(result).toContain('## Verification Summary');
    expect(result).toContain('| Total Claims | 2 |');
    expect(result).toContain('Verified');
    expect(result).toContain('Unverified');
    expect(result).toContain('45%');
  });

  it('inserts verification badges inline', () => {
    const result = formatMarkdown(makeOptions({ verification: makeVerification() }));
    // The verified claim should have a checkmark badge
    expect(result).toContain('\u2713');
    // Should have footnote references
    expect(result).toContain('[^claim-1]');
  });

  it('includes footnotes with verification details', () => {
    const result = formatMarkdown(makeOptions({ verification: makeVerification() }));
    expect(result).toContain('[^claim-1]:');
    expect(result).toContain('VERIFIED');
    expect(result).toContain('90%');
    expect(result).toContain('gather stage output');
  });

  it('includes disputed claims section when disputes exist', () => {
    const verification = makeVerification();
    verification.claims[1].status = 'disputed';
    verification.claims[1].confidence = 0.3;
    verification.claims[1].reasoning = 'Claim could not be verified against sources.';
    verification.summary.unverified = 0;
    verification.summary.disputed = 1;

    const result = formatMarkdown(makeOptions({ verification }));
    expect(result).toContain('### Disputed Claims');
    expect(result).toContain('claim-2');
  });

  it('works without verification', () => {
    const result = formatMarkdown(makeOptions());
    expect(result).not.toContain('## Verification Summary');
    expect(result).not.toContain('verified_claims');
    expect(result).toContain('# NVDA Analysis');
  });

  it('includes generated by footer', () => {
    const result = formatMarkdown(makeOptions());
    expect(result).toContain('Generated by');
    expect(result).toContain('scrutari');
  });
});
