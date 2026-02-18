import { describe, it, expect } from 'vitest';
import {
  generateReport,
  computeSummary,
  annotateText,
  renderReportMarkdown,
  renderReportJSON,
} from './reporter.js';
import type { Claim } from './types.js';

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    text: 'Revenue was $50 billion',
    category: 'metric',
    status: 'verified',
    confidence: 0.9,
    sources: [{
      sourceId: 'stage:gather',
      label: 'gather stage output',
      stage: 'gather',
      excerpt: 'Revenue of $50 billion reported.',
    }],
    reasoning: 'Numeric value matched in source data.',
    ...overrides,
  };
}

describe('computeSummary', () => {
  it('computes correct counts', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'c1', status: 'verified', confidence: 0.9 }),
      makeClaim({ id: 'c2', status: 'verified', confidence: 0.8 }),
      makeClaim({ id: 'c3', status: 'unverified', confidence: 0 }),
      makeClaim({ id: 'c4', status: 'disputed', confidence: 0.3 }),
      makeClaim({ id: 'c5', status: 'error', confidence: 0 }),
    ];

    const summary = computeSummary(claims);
    expect(summary.totalClaims).toBe(5);
    expect(summary.verified).toBe(2);
    expect(summary.unverified).toBe(1);
    expect(summary.disputed).toBe(1);
    expect(summary.errors).toBe(1);
  });

  it('computes overall confidence as average', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'c1', confidence: 0.9 }),
      makeClaim({ id: 'c2', confidence: 0.7 }),
      makeClaim({ id: 'c3', confidence: 0.5 }),
    ];

    const summary = computeSummary(claims);
    expect(summary.overallConfidence).toBe(0.7);
  });

  it('handles empty claims array', () => {
    const summary = computeSummary([]);
    expect(summary.totalClaims).toBe(0);
    expect(summary.overallConfidence).toBe(0);
  });
});

describe('annotateText', () => {
  it('inserts footnote markers after matched claim text', () => {
    const text = 'Revenue was $50 billion in 2024. Earnings grew by 15%.';
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', text: 'Revenue was $50 billion' }),
    ];

    const annotated = annotateText(text, claims);
    expect(annotated).toContain('Revenue was $50 billion[^claim-1]');
  });

  it('handles multiple claims', () => {
    const text = 'Revenue was $50 billion. Net income was $10 billion. Growth rate: 15%.';
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', text: 'Revenue was $50 billion' }),
      makeClaim({ id: 'claim-2', text: 'Net income was $10 billion' }),
    ];

    const annotated = annotateText(text, claims);
    expect(annotated).toContain('[^claim-1]');
    expect(annotated).toContain('[^claim-2]');
  });

  it('handles claims not found in text (partial match)', () => {
    const text = 'The total revenue for the company reached new highs in fiscal 2024.';
    const claims: Claim[] = [
      makeClaim({
        id: 'claim-1',
        text: 'The total revenue for the company reached new highs',
      }),
    ];

    const annotated = annotateText(text, claims);
    expect(annotated).toContain('[^claim-1]');
  });

  it('handles claims with no match at all', () => {
    const text = 'This is a simple text.';
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', text: 'Completely different text that is nowhere in the source' }),
    ];

    // Should still return the original text (with or without annotation)
    const annotated = annotateText(text, claims);
    expect(annotated).toContain('This is a simple text.');
  });
});

describe('generateReport', () => {
  it('generates a complete report', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', status: 'verified', confidence: 0.9 }),
      makeClaim({ id: 'claim-2', status: 'unverified', confidence: 0 }),
    ];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion. More analysis here.',
    });

    expect(report.claims).toHaveLength(2);
    expect(report.summary.totalClaims).toBe(2);
    expect(report.summary.verified).toBe(1);
    expect(report.summary.unverified).toBe(1);
    expect(report.analysisText).toContain('Revenue was $50 billion');
    expect(report.annotatedText).toBeDefined();
    expect(Object.keys(report.footnotes)).toHaveLength(2);
  });

  it('footnotes contain status and confidence', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', status: 'verified', confidence: 0.9 }),
    ];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion.',
    });

    expect(report.footnotes['claim-1']).toContain('[VERIFIED]');
    expect(report.footnotes['claim-1']).toContain('90%');
  });

  it('footnotes include sources', () => {
    const claims: Claim[] = [
      makeClaim({
        id: 'claim-1',
        sources: [{
          sourceId: 'stage:gather',
          label: 'gather stage output',
          stage: 'gather',
          excerpt: 'Revenue data.',
        }],
      }),
    ];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion.',
    });

    expect(report.footnotes['claim-1']).toContain('gather stage output');
  });

  it('footnotes include reasoning when enabled', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', reasoning: 'Matched in source' }),
    ];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion.',
      options: { includeReasoning: true },
    });

    expect(report.footnotes['claim-1']).toContain('Matched in source');
  });

  it('skips annotated text when disabled', () => {
    const claims: Claim[] = [makeClaim()];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion.',
      options: { includeAnnotatedText: false },
    });

    expect(report.annotatedText).toBe('');
  });
});

describe('renderReportMarkdown', () => {
  it('renders a markdown report with all sections', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', status: 'verified', confidence: 0.9 }),
    ];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion.',
    });

    const md = renderReportMarkdown(report);
    expect(md).toContain('## Verification Summary');
    expect(md).toContain('## Annotated Analysis');
    expect(md).toContain('## Claim Details');
    expect(md).toContain('## Footnotes');
    expect(md).toContain('[VERIFIED]');
    expect(md).toContain('| Total Claims | 1 |');
  });
});

describe('renderReportJSON', () => {
  it('renders a valid JSON string', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'claim-1', status: 'verified', confidence: 0.9 }),
    ];

    const report = generateReport({
      claims,
      analysisText: 'Revenue was $50 billion.',
    });

    const jsonStr = renderReportJSON(report);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.summary.totalClaims).toBe(1);
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.claims[0].id).toBe('claim-1');
    expect(parsed.claims[0].status).toBe('verified');
  });
});
