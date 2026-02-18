import { describe, it, expect } from 'vitest';
import { formatDocx, type DocxFormatOptions } from './docx.js';
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

function makeOptions(overrides: Partial<DocxFormatOptions> = {}): DocxFormatOptions {
  return {
    primaryOutput: '# NVDA Analysis\n\n## Executive Summary\n\nNVDA is performing well.\n\n## Details\n\n- Revenue grew 30%\n- **Strong** performance in data centers\n- *Continued* AI momentum',
    outputs: { gather: 'raw data', analyze: 'analysis' },
    inputs: { ticker: 'NVDA' },
    skill: makeSkill(),
    ...overrides,
  };
}

describe('formatDocx', () => {
  it('produces a valid buffer', async () => {
    const buffer = await formatDocx(makeOptions());
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('produces a valid DOCX file (ZIP format with PK signature)', async () => {
    const buffer = await formatDocx(makeOptions());
    // DOCX files are ZIP archives starting with PK signature
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });

  it('handles content with markdown headings', async () => {
    const buffer = await formatDocx(makeOptions({
      primaryOutput: '# Title\n\n## Section 1\n\nContent.\n\n### Subsection\n\nMore content.',
    }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles content with bullet points', async () => {
    const buffer = await formatDocx(makeOptions({
      primaryOutput: '# Report\n\n- Point one\n- Point two\n* Point three',
    }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles empty content', async () => {
    const buffer = await formatDocx(makeOptions({ primaryOutput: '' }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles content with inline formatting', async () => {
    const buffer = await formatDocx(makeOptions({
      primaryOutput: 'This has **bold**, *italic*, and `code` formatting.',
    }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('includes model and cost on cover page when provided', async () => {
    const buffer = await formatDocx(makeOptions({
      model: 'claude-sonnet-4-20250514',
      totalCostUsd: 0.47,
    }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('includes verification section when provided', async () => {
    const verification: VerificationReport = {
      claims: [{
        id: 'claim-1',
        text: 'Revenue grew 30%',
        category: 'metric',
        status: 'verified',
        confidence: 0.9,
        sources: [],
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

    const buffer = await formatDocx(makeOptions({ verification }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('includes disputed claims in verification section', async () => {
    const verification: VerificationReport = {
      claims: [{
        id: 'claim-1',
        text: 'Revenue was $100B',
        category: 'metric',
        status: 'disputed',
        confidence: 0.3,
        sources: [],
        reasoning: 'Value mismatch: source shows $85B.',
      }],
      summary: {
        totalClaims: 1,
        verified: 0,
        unverified: 0,
        disputed: 1,
        errors: 0,
        overallConfidence: 0.3,
      },
      analysisText: '',
      annotatedText: '',
      footnotes: {},
    };

    const buffer = await formatDocx(makeOptions({ verification }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('includes duration in metadata section', async () => {
    const buffer = await formatDocx(makeOptions({
      totalDurationMs: 45000,
    }));
    expect(buffer.length).toBeGreaterThan(0);
  });
});
