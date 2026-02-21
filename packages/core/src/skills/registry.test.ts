import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillRegistry, AgentSkillRegistry } from './registry.js';
import type { SkillEntry } from './types.js';

function makeEntry(name: string, source: 'built-in' | 'user' = 'built-in'): SkillEntry {
  return {
    skill: {
      name,
      description: `${name} description`,
      stages: [{ name: 'stage1', prompt: 'test prompt' }],
      output: { primary: 'stage1' },
    },
    filePath: `/skills/${name}.yaml`,
    source,
  };
}

function makeSkillYaml(name: string, description: string): string {
  return [
    `name: ${name}`,
    `description: ${description}`,
    'stages:',
    '  - name: stage1',
    '    prompt: test prompt',
    'output:',
    '  primary: stage1',
  ].join('\n');
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.list()).toEqual([]);
    expect(registry.names()).toEqual([]);
  });

  it('registers and retrieves a skill', () => {
    const entry = makeEntry('test-skill');
    registry.register(entry);
    expect(registry.get('test-skill')).toBe(entry);
    expect(registry.size).toBe(1);
  });

  it('returns undefined for unknown skill', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('has() returns correct boolean', () => {
    registry.register(makeEntry('exists'));
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('list() returns all entries', () => {
    registry.register(makeEntry('a'));
    registry.register(makeEntry('b'));
    expect(registry.list()).toHaveLength(2);
  });

  it('names() returns all skill names', () => {
    registry.register(makeEntry('alpha'));
    registry.register(makeEntry('beta'));
    expect(registry.names().sort()).toEqual(['alpha', 'beta']);
  });

  it('duplicate register replaces the previous entry', () => {
    registry.register(makeEntry('dup', 'built-in'));
    registry.register(makeEntry('dup', 'user'));
    expect(registry.size).toBe(1);
    expect(registry.get('dup')?.source).toBe('user');
  });

  it('remove() deletes a skill', () => {
    registry.register(makeEntry('removable'));
    expect(registry.remove('removable')).toBe(true);
    expect(registry.has('removable')).toBe(false);
    expect(registry.remove('removable')).toBe(false);
  });

  it('clear() removes all skills', () => {
    registry.register(makeEntry('a'));
    registry.register(makeEntry('b'));
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('loadFrom() loads skills from directories', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'scrutari-reg-'));
    const builtInDir = join(tempDir, 'builtin');
    mkdirSync(builtInDir);
    writeFileSync(join(builtInDir, 'my-skill.yaml'), makeSkillYaml('my-skill', 'test'));

    registry.loadFrom({ builtInDir });
    expect(registry.has('my-skill')).toBe(true);
    expect(registry.size).toBe(1);

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// AgentSkillRegistry
// ---------------------------------------------------------------------------

function makeAgentSkillMd(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody for ${name}.`;
}

describe('AgentSkillRegistry', () => {
  let registry: AgentSkillRegistry;
  let tempDir: string;

  beforeEach(() => {
    registry = new AgentSkillRegistry();
    tempDir = mkdtempSync(join(tmpdir(), 'scrutari-agent-reg-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.listSummaries()).toEqual([]);
    expect(registry.names()).toEqual([]);
  });

  it('loads summaries from directories', () => {
    const skillDir = join(tempDir, 'my-skill');
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, 'SKILL.md'), makeAgentSkillMd('my-skill', 'A skill'));

    registry.loadSummariesFrom({ builtInDir: tempDir });
    expect(registry.has('my-skill')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('getSummary returns summary for known skill', () => {
    const skillDir = join(tempDir, 'test-skill');
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, 'SKILL.md'), makeAgentSkillMd('test-skill', 'Test'));

    registry.loadSummariesFrom({ builtInDir: tempDir });
    const summary = registry.getSummary('test-skill');
    expect(summary).toBeDefined();
    expect(summary?.name).toBe('test-skill');
    expect(summary?.kind).toBe('agent');
  });

  it('getSummary returns undefined for unknown skill', () => {
    expect(registry.getSummary('nonexistent')).toBeUndefined();
  });

  it('load() returns full skill and caches it', () => {
    const skillDir = join(tempDir, 'loadable');
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, 'SKILL.md'), makeAgentSkillMd('loadable', 'Loadable skill'));

    registry.loadSummariesFrom({ builtInDir: tempDir });

    const skill = registry.load('loadable');
    expect(skill).toBeDefined();
    expect(skill?.frontmatter.name).toBe('loadable');
    expect(skill?.body).toContain('Body for loadable');

    // Second load returns cached
    const cached = registry.load('loadable');
    expect(cached).toBe(skill);
  });

  it('load() returns undefined for unknown skill', () => {
    expect(registry.load('nonexistent')).toBeUndefined();
  });

  it('user skills override built-in by name', () => {
    const builtInDir = join(tempDir, 'builtin');
    const userDir = join(tempDir, 'user');
    mkdirSync(builtInDir);
    mkdirSync(userDir);

    const biSkill = join(builtInDir, 'shared');
    mkdirSync(biSkill);
    writeFileSync(join(biSkill, 'SKILL.md'), makeAgentSkillMd('shared', 'Built-in version'));

    const uSkill = join(userDir, 'shared');
    mkdirSync(uSkill);
    writeFileSync(join(uSkill, 'SKILL.md'), makeAgentSkillMd('shared', 'User version'));

    registry.loadSummariesFrom({ builtInDir, userDir });
    expect(registry.size).toBe(1);
    expect(registry.getSummary('shared')?.description).toBe('User version');
    expect(registry.getSummary('shared')?.source).toBe('user');
  });

  it('clear() removes all summaries and loaded skills', () => {
    const skillDir = join(tempDir, 'clearable');
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, 'SKILL.md'), makeAgentSkillMd('clearable', 'Test'));

    registry.loadSummariesFrom({ builtInDir: tempDir });
    registry.load('clearable');
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.load('clearable')).toBeUndefined();
  });
});
