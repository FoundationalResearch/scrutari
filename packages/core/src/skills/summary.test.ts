import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSkillSummaries, scanUnifiedSummaries } from './summary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'scrutari-summary-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// scanSkillSummaries
// ---------------------------------------------------------------------------

describe('scanSkillSummaries', () => {
  it('extracts name and description from valid YAML', () => {
    const dir = join(tempDir, 'skills');
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'deep-dive.yaml'),
      'name: deep-dive\ndescription: Full company analysis\nstages:\n  - name: s1\n    prompt: test\noutput:\n  primary: s1\n',
    );

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('deep-dive');
    expect(summaries[0].description).toBe('Full company analysis');
    expect(summaries[0].source).toBe('built-in');
    expect(summaries[0].filePath).toBe(join(dir, 'deep-dive.yaml'));
  });

  it('falls back to filename stem and "Failed to load" for invalid YAML', () => {
    const dir = join(tempDir, 'skills');
    mkdirSync(dir);
    writeFileSync(join(dir, 'broken.yaml'), '{ invalid yaml:: [');

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('broken');
    expect(summaries[0].description).toBe('Failed to load');
    expect(summaries[0].source).toBe('built-in');
  });

  it('falls back when description field is missing', () => {
    const dir = join(tempDir, 'skills');
    mkdirSync(dir);
    writeFileSync(join(dir, 'no-desc.yaml'), 'name: no-desc\nstages: []\n');

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('no-desc');
    expect(summaries[0].description).toBe('Failed to load');
  });

  it('user skill overrides built-in skill with the same name', () => {
    const builtInDir = join(tempDir, 'builtin');
    const userDir = join(tempDir, 'user');
    mkdirSync(builtInDir);
    mkdirSync(userDir);

    writeFileSync(
      join(builtInDir, 'analysis.yaml'),
      'name: analysis\ndescription: Built-in analysis\n',
    );
    writeFileSync(
      join(userDir, 'analysis.yaml'),
      'name: analysis\ndescription: Custom user analysis\n',
    );

    const summaries = scanSkillSummaries(builtInDir, userDir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('analysis');
    expect(summaries[0].description).toBe('Custom user analysis');
    expect(summaries[0].source).toBe('user');
  });

  it('returns empty array when directory does not exist', () => {
    const summaries = scanSkillSummaries('/nonexistent/path/that/does/not/exist');
    expect(summaries).toEqual([]);
  });

  it('returns empty array for an empty directory', () => {
    const dir = join(tempDir, 'empty');
    mkdirSync(dir);

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toEqual([]);
  });

  it('recognizes both .yaml and .yml extensions', () => {
    const dir = join(tempDir, 'skills');
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'skill-a.yaml'),
      'name: skill-a\ndescription: YAML extension\n',
    );
    writeFileSync(
      join(dir, 'skill-b.yml'),
      'name: skill-b\ndescription: YML extension\n',
    );

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(2);
    const names = summaries.map(s => s.name).sort();
    expect(names).toEqual(['skill-a', 'skill-b']);
  });

  it('ignores non-YAML files', () => {
    const dir = join(tempDir, 'skills');
    mkdirSync(dir);
    writeFileSync(join(dir, 'readme.md'), '# Not a skill');
    writeFileSync(join(dir, 'data.json'), '{}');
    writeFileSync(join(dir, 'script.ts'), 'export {}');
    writeFileSync(
      join(dir, 'real-skill.yaml'),
      'name: real-skill\ndescription: Actual skill\n',
    );

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('real-skill');
  });

  it('returns empty array when user directory does not exist', () => {
    const builtInDir = join(tempDir, 'builtin');
    mkdirSync(builtInDir);
    writeFileSync(
      join(builtInDir, 'skill.yaml'),
      'name: skill\ndescription: A skill\n',
    );

    const summaries = scanSkillSummaries(builtInDir, '/nonexistent/user/dir');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('skill');
    expect(summaries[0].source).toBe('built-in');
  });

  it('falls back when name field is missing', () => {
    const dir = join(tempDir, 'skills');
    mkdirSync(dir);
    writeFileSync(join(dir, 'unnamed.yaml'), 'description: Has description but no name\n');

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(1);
    // SummarySchema requires both name and description, so safeParse fails
    expect(summaries[0].name).toBe('unnamed');
    expect(summaries[0].description).toBe('Failed to load');
  });

  it('handles multiple skills from both directories with different names', () => {
    const builtInDir = join(tempDir, 'builtin');
    const userDir = join(tempDir, 'user');
    mkdirSync(builtInDir);
    mkdirSync(userDir);

    writeFileSync(
      join(builtInDir, 'alpha.yaml'),
      'name: alpha\ndescription: Alpha skill\n',
    );
    writeFileSync(
      join(builtInDir, 'beta.yaml'),
      'name: beta\ndescription: Beta skill\n',
    );
    writeFileSync(
      join(userDir, 'gamma.yaml'),
      'name: gamma\ndescription: Gamma skill\n',
    );

    const summaries = scanSkillSummaries(builtInDir, userDir);
    expect(summaries).toHaveLength(3);
    const names = summaries.map(s => s.name).sort();
    expect(names).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('handles *.pipeline.yaml filenames correctly', () => {
    const dir = join(tempDir, 'pipeline-names');
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'deep-dive.pipeline.yaml'),
      'name: deep-dive\ndescription: Pipeline skill\n',
    );

    const summaries = scanSkillSummaries(dir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('deep-dive');
  });
});

// ---------------------------------------------------------------------------
// scanUnifiedSummaries
// ---------------------------------------------------------------------------

describe('scanUnifiedSummaries', () => {
  it('merges pipeline and agent skill summaries', () => {
    const dir = join(tempDir, 'unified');
    mkdirSync(dir);

    // Pipeline skill
    writeFileSync(
      join(dir, 'deep-dive.pipeline.yaml'),
      'name: deep-dive\ndescription: Pipeline analysis\n',
    );

    // Agent skill
    const agentDir = join(dir, 'dcf-valuation');
    mkdirSync(agentDir);
    writeFileSync(
      join(agentDir, 'SKILL.md'),
      '---\nname: dcf-valuation\ndescription: DCF methodology\n---\n\n# DCF\n\nBody.',
    );

    const unified = scanUnifiedSummaries(dir);
    expect(unified).toHaveLength(2);

    const pipeline = unified.find(s => s.kind === 'pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline?.name).toBe('deep-dive');

    const agent = unified.find(s => s.kind === 'agent');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('dcf-valuation');
  });

  it('returns empty for directory with neither type', () => {
    const dir = join(tempDir, 'empty-unified');
    mkdirSync(dir);
    const unified = scanUnifiedSummaries(dir);
    expect(unified).toEqual([]);
  });

  it('tags pipeline and agent summaries correctly', () => {
    const dir = join(tempDir, 'tags');
    mkdirSync(dir);

    writeFileSync(join(dir, 'skill-a.yaml'), 'name: skill-a\ndescription: Pipeline\n');

    const agentDir = join(dir, 'skill-b');
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'SKILL.md'), '---\nname: skill-b\ndescription: Agent\n---\n\nBody.');

    const unified = scanUnifiedSummaries(dir);
    expect(unified.find(s => s.name === 'skill-a')?.kind).toBe('pipeline');
    expect(unified.find(s => s.name === 'skill-b')?.kind).toBe('agent');
  });
});
