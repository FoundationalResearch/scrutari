import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { SkillSchema } from '@scrutari/core';
import type { SkillDefinition } from './writer.js';

// Mock homedir so writeSkillFile writes to a temp directory
let tempDir: string;
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

// Import after mock is set up
const { generateSkillYaml, writeSkillFile } = await import('./writer.js');

function makeMinimalDefinition(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    name: 'test-skill',
    description: 'A test skill for unit tests',
    stages: [
      {
        name: 'analyze',
        prompt: 'Analyze the given data.',
        output_format: 'markdown',
      },
    ],
    output: {
      primary: 'analyze',
      format: 'markdown',
    },
    ...overrides,
  };
}

function makeFullDefinition(): SkillDefinition {
  return {
    name: 'full-skill',
    description: 'A fully-featured skill for testing',
    inputs: [
      {
        name: 'ticker',
        type: 'string',
        required: true,
        description: 'Stock ticker symbol',
      },
      {
        name: 'depth',
        type: 'string',
        required: false,
        default: 'standard',
        description: 'Analysis depth',
      },
    ],
    tools_required: ['edgar', 'market-data'],
    tools_optional: ['news'],
    stages: [
      {
        name: 'gather',
        model: 'claude-haiku-3-5-20241022',
        prompt: 'Gather data for {ticker}.',
        tools: ['edgar', 'market-data'],
        output_format: 'json',
      },
      {
        name: 'analyze',
        model: 'claude-sonnet-4-20250514',
        prompt: 'Analyze {ticker} with depth {depth}.',
        input_from: ['gather'],
        output_format: 'markdown',
      },
    ],
    output: {
      primary: 'analyze',
      format: 'markdown',
    },
  };
}

describe('generateSkillYaml', () => {
  it('produces a non-empty YAML string', () => {
    const yaml = generateSkillYaml(makeMinimalDefinition());
    expect(typeof yaml).toBe('string');
    expect(yaml.length).toBeGreaterThan(0);
  });

  it('generated YAML round-trips through SkillSchema validation', () => {
    const yaml = generateSkillYaml(makeMinimalDefinition());
    const parsed = parseYaml(yaml);
    const result = SkillSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('includes name and description in generated YAML', () => {
    const yaml = generateSkillYaml(makeMinimalDefinition());
    const parsed = parseYaml(yaml);
    expect(parsed.name).toBe('test-skill');
    expect(parsed.description).toBe('A test skill for unit tests');
  });

  it('handles definitions with inputs', () => {
    const def = makeFullDefinition();
    const yaml = generateSkillYaml(def);
    const parsed = parseYaml(yaml);

    expect(parsed.inputs).toHaveLength(2);
    expect(parsed.inputs[0].name).toBe('ticker');
    expect(parsed.inputs[0].type).toBe('string');
    expect(parsed.inputs[0].required).toBe(true);
    expect(parsed.inputs[1].default).toBe('standard');

    const result = SkillSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('handles definitions without inputs', () => {
    const yaml = generateSkillYaml(makeMinimalDefinition());
    const parsed = parseYaml(yaml);
    expect(parsed.inputs).toBeUndefined();
  });

  it('handles all stage fields', () => {
    const def = makeFullDefinition();
    const yaml = generateSkillYaml(def);
    const parsed = parseYaml(yaml);

    const gatherStage = parsed.stages[0];
    expect(gatherStage.name).toBe('gather');
    expect(gatherStage.model).toBe('claude-haiku-3-5-20241022');
    expect(gatherStage.tools).toEqual(['edgar', 'market-data']);
    expect(gatherStage.output_format).toBe('json');

    const analyzeStage = parsed.stages[1];
    expect(analyzeStage.input_from).toEqual(['gather']);
    expect(analyzeStage.output_format).toBe('markdown');
  });

  it('includes tools_required and tools_optional when specified', () => {
    const def = makeFullDefinition();
    const yaml = generateSkillYaml(def);
    const parsed = parseYaml(yaml);

    expect(parsed.tools_required).toEqual(['edgar', 'market-data']);
    expect(parsed.tools_optional).toEqual(['news']);
  });

  it('omits tools_required and tools_optional when empty or missing', () => {
    const yaml = generateSkillYaml(makeMinimalDefinition());
    const parsed = parseYaml(yaml);
    expect(parsed.tools_required).toBeUndefined();
    expect(parsed.tools_optional).toBeUndefined();
  });

  it('full definition round-trips through SkillSchema validation', () => {
    const yaml = generateSkillYaml(makeFullDefinition());
    const parsed = parseYaml(yaml);
    const result = SkillSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});

describe('writeSkillFile', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scrutari-writer-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the skill file in ~/.scrutari/skills/', () => {
    const filePath = writeSkillFile(makeMinimalDefinition());

    expect(filePath).toBe(join(tempDir, '.scrutari', 'skills', 'test-skill.yaml'));
    expect(existsSync(filePath)).toBe(true);
  });

  it('writes valid YAML content to the file', () => {
    const filePath = writeSkillFile(makeMinimalDefinition());
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseYaml(content);

    expect(parsed.name).toBe('test-skill');
    expect(parsed.description).toBe('A test skill for unit tests');
  });

  it('creates the skills directory if it does not exist', () => {
    const skillsDir = join(tempDir, '.scrutari', 'skills');
    expect(existsSync(skillsDir)).toBe(false);

    writeSkillFile(makeMinimalDefinition());

    expect(existsSync(skillsDir)).toBe(true);
  });

  it('writes a full definition that passes SkillSchema validation', () => {
    const filePath = writeSkillFile(makeFullDefinition());
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseYaml(content);
    const result = SkillSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('throws if the generated YAML would fail validation', () => {
    const badDefinition: SkillDefinition = {
      name: 'bad-skill',
      description: 'A broken skill',
      stages: [
        {
          name: 'step1',
          prompt: 'Do something.',
          output_format: 'markdown',
        },
      ],
      output: {
        primary: 'nonexistent-stage', // references a stage that does not exist
        format: 'markdown',
      },
    };

    expect(() => writeSkillFile(badDefinition)).toThrow('Generated skill YAML is invalid');
  });
});
