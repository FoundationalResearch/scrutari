import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeOutput, writeOutputAsync, resolveFilename } from './writer.js';
import type { Skill } from '../skills/types.js';

let tempDir: string;

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    stages: [
      { name: 'gather', prompt: 'Gather data' },
      { name: 'analyze', prompt: 'Analyze data', input_from: ['gather'] },
    ],
    output: { primary: 'analyze' },
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'scrutari-output-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('resolveFilename', () => {
  it('uses filename_template with variable substitution', () => {
    const skill = makeSkill({
      output: { primary: 'analyze', filename_template: '{ticker}-deep-dive' },
    });
    const result = resolveFilename(skill, { ticker: 'NVDA' });
    expect(result).toBe('NVDA-deep-dive');
  });

  it('falls back to skill name when no template', () => {
    const skill = makeSkill();
    const result = resolveFilename(skill, { ticker: 'NVDA' });
    expect(result).toBe('test-skill');
  });

  it('substitutes date variable', () => {
    const skill = makeSkill({
      output: { primary: 'analyze', filename_template: 'report-{date}' },
    });
    const result = resolveFilename(skill, {});
    // Should match YYYY-MM-DD pattern
    expect(result).toMatch(/^report-\d{4}-\d{2}-\d{2}$/);
  });
});

describe('writeOutput', () => {
  it('writes markdown output with frontmatter', () => {
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: '# Analysis\n\nThis is the analysis.',
      outputs: { gather: 'raw data', analyze: '# Analysis\n\nThis is the analysis.' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
      outputFormat: 'markdown',
    });

    expect(result.primaryPath).toContain('.md');
    expect(existsSync(result.primaryPath)).toBe(true);
    const content = readFileSync(result.primaryPath, 'utf-8');
    // Should contain YAML frontmatter
    expect(content).toContain('---');
    expect(content).toContain('ticker: NVDA');
    expect(content).toContain('skill: test-skill');
    // Should contain the original analysis content
    expect(content).toContain('# Analysis');
    expect(content).toContain('This is the analysis.');
    // Should contain execution details
    expect(content).toContain('## Execution Details');
  });

  it('writes JSON output with structured metadata', () => {
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: 'the output',
      outputs: { gather: 'data', analyze: 'the output' },
      inputs: { ticker: 'AAPL' },
      outputDir: tempDir,
      outputFormat: 'json',
    });

    expect(result.primaryPath).toContain('.json');
    const content = JSON.parse(readFileSync(result.primaryPath, 'utf-8'));
    expect(content.metadata.skill).toBe('test-skill');
    expect(content.metadata.ticker).toBe('AAPL');
    expect(content.metadata.date).toBeDefined();
    expect(content.summary).toBeDefined();
    expect(content.stages).toHaveProperty('gather');
    expect(content.stages).toHaveProperty('analyze');
    expect(content.stages.gather.output).toBe('data');
    expect(content.stages.analyze.output).toBe('the output');
  });

  it('includes cost and model in JSON metadata', () => {
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: 'output',
      outputs: { analyze: 'output' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
      outputFormat: 'json',
      model: 'claude-sonnet-4-20250514',
      totalCostUsd: 0.47,
    });

    const content = JSON.parse(readFileSync(result.primaryPath, 'utf-8'));
    expect(content.metadata.model).toBe('claude-sonnet-4-20250514');
    expect(content.metadata.cost).toBe(0.47);
  });

  it('includes verification data in JSON output', () => {
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: 'output',
      outputs: { analyze: 'output' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
      outputFormat: 'json',
      verification: {
        claims: [{
          id: 'claim-1',
          text: 'Revenue was $50B',
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
        analysisText: 'output',
        annotatedText: 'output',
        footnotes: {},
      },
    });

    const content = JSON.parse(readFileSync(result.primaryPath, 'utf-8'));
    expect(content.verification).toBeDefined();
    expect(content.verification.total).toBe(1);
    expect(content.verification.verified).toBe(1);
    expect(content.claims).toHaveLength(1);
    expect(content.claims[0].id).toBe('claim-1');
  });

  it('includes verification badges in markdown', () => {
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: 'Revenue was $50 billion in Q4.',
      outputs: { analyze: 'Revenue was $50 billion in Q4.' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
      outputFormat: 'markdown',
      verification: {
        claims: [{
          id: 'claim-1',
          text: 'Revenue was $50 billion',
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
        analysisText: 'Revenue was $50 billion in Q4.',
        annotatedText: 'Revenue was $50 billion in Q4.',
        footnotes: {},
      },
    });

    const content = readFileSync(result.primaryPath, 'utf-8');
    expect(content).toContain('verified_claims: 1/1');
    expect(content).toContain('## Verification Summary');
  });

  it('saves intermediate outputs when configured', () => {
    const skill = makeSkill({
      output: { primary: 'analyze', save_intermediate: true },
    });

    const result = writeOutput({
      skill,
      primaryOutput: 'final analysis',
      outputs: { gather: 'gathered data', analyze: 'final analysis' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
    });

    expect(result.intermediatePaths).toHaveLength(1);
    expect(result.intermediatePaths[0]).toContain('gather.md');
    const content = readFileSync(result.intermediatePaths[0], 'utf-8');
    expect(content).toBe('gathered data');
  });

  it('does not save intermediate outputs by default', () => {
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: 'output',
      outputs: { gather: 'data', analyze: 'output' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
    });

    expect(result.intermediatePaths).toHaveLength(0);
  });

  it('creates output directory if it does not exist', () => {
    const nestedDir = join(tempDir, 'sub', 'dir');
    const result = writeOutput({
      skill: makeSkill(),
      primaryOutput: 'output',
      outputs: { gather: 'data', analyze: 'output' },
      inputs: { ticker: 'NVDA' },
      outputDir: nestedDir,
    });

    expect(existsSync(result.primaryPath)).toBe(true);
  });

  it('uses filename_template from skill', () => {
    const skill = makeSkill({
      output: { primary: 'analyze', filename_template: '{ticker}-report' },
    });

    const result = writeOutput({
      skill,
      primaryOutput: 'output',
      outputs: { analyze: 'output' },
      inputs: { ticker: 'MSFT' },
      outputDir: tempDir,
    });

    expect(result.primaryPath).toContain('MSFT-report.md');
  });
});

describe('writeOutputAsync', () => {
  it('writes markdown output', async () => {
    const result = await writeOutputAsync({
      skill: makeSkill(),
      primaryOutput: '# Test',
      outputs: { analyze: '# Test' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
      outputFormat: 'markdown',
    });

    expect(result.primaryPath).toContain('.md');
    expect(existsSync(result.primaryPath)).toBe(true);
    const content = readFileSync(result.primaryPath, 'utf-8');
    expect(content).toContain('# Test');
  });

  it('writes JSON output', async () => {
    const result = await writeOutputAsync({
      skill: makeSkill(),
      primaryOutput: 'output',
      outputs: { analyze: 'output' },
      inputs: { ticker: 'AAPL' },
      outputDir: tempDir,
      outputFormat: 'json',
    });

    expect(result.primaryPath).toContain('.json');
    const content = JSON.parse(readFileSync(result.primaryPath, 'utf-8'));
    expect(content.metadata.skill).toBe('test-skill');
  });

  it('writes docx output with markdown alongside', async () => {
    const result = await writeOutputAsync({
      skill: makeSkill(),
      primaryOutput: '# Report\n\nContent here.',
      outputs: { analyze: '# Report\n\nContent here.' },
      inputs: { ticker: 'NVDA' },
      outputDir: tempDir,
      outputFormat: 'docx',
    });

    expect(result.primaryPath).toContain('.docx');
    expect(existsSync(result.primaryPath)).toBe(true);

    // Should also have a markdown file alongside
    const mdPath = result.primaryPath.replace('.docx', '.md');
    expect(existsSync(mdPath)).toBe(true);
    const mdContent = readFileSync(mdPath, 'utf-8');
    expect(mdContent).toContain('# Report');

    // Verify the docx is a valid file (starts with PK zip signature)
    const docxBuffer = readFileSync(result.primaryPath);
    expect(docxBuffer[0]).toBe(0x50); // P
    expect(docxBuffer[1]).toBe(0x4b); // K
  });
});
