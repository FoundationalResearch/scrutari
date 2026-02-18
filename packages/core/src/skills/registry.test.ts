import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillRegistry } from './registry.js';
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
