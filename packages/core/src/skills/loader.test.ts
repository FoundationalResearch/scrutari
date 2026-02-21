import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanSkillFiles,
  parseSkillFile,
  validateDAG,
  topologicalSort,
  computeExecutionLevels,
  substituteVariables,
  loadAllSkills,
  validateSubPipelineRefs,
  SkillLoadError,
  SkillValidationError,
  SkillCycleError,
} from './loader.js';
import type { Skill } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function makeSkillYaml(overrides: Record<string, unknown> = {}): string {
  const skill = {
    name: 'test-skill',
    description: 'A test skill',
    stages: [{ name: 'stage1', prompt: 'Do something' }],
    output: { primary: 'stage1' },
    ...overrides,
  };
  // Simple YAML serialization for test fixtures
  return toYaml(skill);
}

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return obj.includes('\n') ? `"${obj}"` : obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const lines = toYaml(item, indent + 1).split('\n');
        return `${pad}- ${lines[0].trim()}\n${lines.slice(1).map(l => `${pad}  ${l.trim()}`).filter(l => l.trim()).join('\n')}`;
      }
      return `${pad}- ${item}`;
    }).join('\n');
  }
  if (typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).map(([key, val]) => {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
      }
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object') {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: [${val.map(v => typeof v === 'string' ? v : String(v)).join(', ')}]`;
      }
      return `${pad}${key}: ${toYaml(val, indent)}`;
    }).join('\n');
  }
  return String(obj);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'scrutari-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// scanSkillFiles
// ---------------------------------------------------------------------------

describe('scanSkillFiles', () => {
  it('finds .yaml and .yml files in a directory', () => {
    writeFileSync(join(tempDir, 'skill1.yaml'), '');
    writeFileSync(join(tempDir, 'skill2.yml'), '');
    writeFileSync(join(tempDir, 'not-a-skill.txt'), '');

    const results = scanSkillFiles(tempDir);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name).sort()).toEqual(['skill1', 'skill2']);
    expect(results.every(r => r.source === 'built-in')).toBe(true);
  });

  it('handles missing directories gracefully', () => {
    const results = scanSkillFiles('/nonexistent/path');
    expect(results).toEqual([]);
  });

  it('scans both built-in and user directories', () => {
    const userDir = mkdtempSync(join(tmpdir(), 'scrutari-user-'));
    writeFileSync(join(tempDir, 'builtin.yaml'), '');
    writeFileSync(join(userDir, 'custom.yaml'), '');

    const results = scanSkillFiles(tempDir, userDir);
    expect(results).toHaveLength(2);
    expect(results.find(r => r.name === 'builtin')?.source).toBe('built-in');
    expect(results.find(r => r.name === 'custom')?.source).toBe('user');

    rmSync(userDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// parseSkillFile
// ---------------------------------------------------------------------------

describe('parseSkillFile', () => {
  it('parses a valid skill file', () => {
    const filePath = join(tempDir, 'valid.yaml');
    writeFileSync(filePath, makeSkillYaml());

    const skill = parseSkillFile(filePath);
    expect(skill.name).toBe('test-skill');
    expect(skill.stages).toHaveLength(1);
  });

  it('throws SkillLoadError for missing file', () => {
    expect(() => parseSkillFile('/nonexistent/file.yaml')).toThrow(SkillLoadError);
  });

  it('throws SkillLoadError for invalid YAML', () => {
    const filePath = join(tempDir, 'bad.yaml');
    writeFileSync(filePath, '{ invalid yaml:: [');

    expect(() => parseSkillFile(filePath)).toThrow(SkillLoadError);
  });

  it('throws SkillValidationError for schema violations', () => {
    const filePath = join(tempDir, 'invalid.yaml');
    writeFileSync(filePath, 'name: bad\ndescription: test\nstages: []\noutput:\n  primary: none\n');

    expect(() => parseSkillFile(filePath)).toThrow(SkillValidationError);
  });
});

// ---------------------------------------------------------------------------
// validateDAG
// ---------------------------------------------------------------------------

describe('validateDAG', () => {
  it('passes for a linear chain', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['b'] },
      ],
      output: { primary: 'c' },
    };
    expect(() => validateDAG(skill)).not.toThrow();
  });

  it('passes for a diamond dependency', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['a'] },
        { name: 'd', prompt: 'test', input_from: ['b', 'c'] },
      ],
      output: { primary: 'd' },
    };
    expect(() => validateDAG(skill)).not.toThrow();
  });

  it('detects a 2-node cycle', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test', input_from: ['b'] },
        { name: 'b', prompt: 'test', input_from: ['a'] },
      ],
      output: { primary: 'a' },
    };
    expect(() => validateDAG(skill)).toThrow(SkillCycleError);
  });

  it('detects a 3-node cycle', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test', input_from: ['c'] },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['b'] },
      ],
      output: { primary: 'a' },
    };
    expect(() => validateDAG(skill)).toThrow(SkillCycleError);
  });

  it('passes for stages with no dependencies', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test' },
      ],
      output: { primary: 'a' },
    };
    expect(() => validateDAG(skill)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe('topologicalSort', () => {
  it('returns correct order for a linear chain', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['b'] },
      ],
      output: { primary: 'c' },
    };
    expect(topologicalSort(skill)).toEqual(['a', 'b', 'c']);
  });

  it('returns correct order for a diamond dependency', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['a'] },
        { name: 'd', prompt: 'test', input_from: ['b', 'c'] },
      ],
      output: { primary: 'd' },
    };
    const order = topologicalSort(skill);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });

  it('handles independent stages in original order', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'x', prompt: 'test' },
        { name: 'y', prompt: 'test' },
        { name: 'z', prompt: 'test' },
      ],
      output: { primary: 'x' },
    };
    expect(topologicalSort(skill)).toEqual(['x', 'y', 'z']);
  });
});

// ---------------------------------------------------------------------------
// computeExecutionLevels
// ---------------------------------------------------------------------------

describe('computeExecutionLevels', () => {
  it('returns single-element levels for a linear chain', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['b'] },
      ],
      output: { primary: 'c' },
    };
    expect(computeExecutionLevels(skill)).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups independent stages into one level', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test' },
        { name: 'c', prompt: 'test' },
      ],
      output: { primary: 'a' },
    };
    expect(computeExecutionLevels(skill)).toEqual([['a', 'b', 'c']]);
  });

  it('handles diamond dependency', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'a', prompt: 'test' },
        { name: 'b', prompt: 'test', input_from: ['a'] },
        { name: 'c', prompt: 'test', input_from: ['a'] },
        { name: 'd', prompt: 'test', input_from: ['b', 'c'] },
      ],
      output: { primary: 'd' },
    };
    const levels = computeExecutionLevels(skill);
    expect(levels).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('handles mixed independent and dependent stages', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'gather_a', prompt: 'test' },
        { name: 'gather_b', prompt: 'test' },
        { name: 'merge', prompt: 'test', input_from: ['gather_a', 'gather_b'] },
        { name: 'format', prompt: 'test', input_from: ['merge'] },
      ],
      output: { primary: 'format' },
    };
    const levels = computeExecutionLevels(skill);
    expect(levels).toEqual([['gather_a', 'gather_b'], ['merge'], ['format']]);
  });

  it('preserves YAML order within a level', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [
        { name: 'z_stage', prompt: 'test' },
        { name: 'a_stage', prompt: 'test' },
        { name: 'm_stage', prompt: 'test' },
      ],
      output: { primary: 'z_stage' },
    };
    // Even though alphabetically a < m < z, YAML order is z, a, m
    expect(computeExecutionLevels(skill)).toEqual([['z_stage', 'a_stage', 'm_stage']]);
  });

  it('handles single-stage skill', () => {
    const skill: Skill = {
      name: 'test',
      description: 'test',
      stages: [{ name: 'only', prompt: 'test' }],
      output: { primary: 'only' },
    };
    expect(computeExecutionLevels(skill)).toEqual([['only']]);
  });
});

// ---------------------------------------------------------------------------
// substituteVariables
// ---------------------------------------------------------------------------

describe('substituteVariables', () => {
  it('substitutes a single variable', () => {
    expect(substituteVariables('Hello {name}', { name: 'world' })).toBe('Hello world');
  });

  it('substitutes multiple variables', () => {
    expect(substituteVariables('{a} and {b}', { a: 'X', b: 'Y' })).toBe('X and Y');
  });

  it('leaves unresolved variables intact', () => {
    expect(substituteVariables('{known} {unknown}', { known: 'yes' })).toBe('yes {unknown}');
  });

  it('joins string arrays with comma-space', () => {
    expect(substituteVariables('Tickers: {tickers}', { tickers: ['AAPL', 'GOOG', 'MSFT'] }))
      .toBe('Tickers: AAPL, GOOG, MSFT');
  });

  it('coerces boolean values to string', () => {
    expect(substituteVariables('Flag: {flag}', { flag: true })).toBe('Flag: true');
  });

  it('coerces number values to string', () => {
    expect(substituteVariables('Count: {count}', { count: 42 })).toBe('Count: 42');
  });
});

// ---------------------------------------------------------------------------
// loadAllSkills
// ---------------------------------------------------------------------------

describe('loadAllSkills', () => {
  it('loads skills and user overrides built-in by name', () => {
    const builtInDir = join(tempDir, 'builtin');
    const userDir = join(tempDir, 'user');
    mkdirSync(builtInDir);
    mkdirSync(userDir);

    writeFileSync(join(builtInDir, 'my-skill.yaml'), makeSkillYaml({ name: 'my-skill', description: 'built-in version' }));
    writeFileSync(join(userDir, 'my-skill.yaml'), makeSkillYaml({ name: 'my-skill', description: 'user version' }));

    const skills = loadAllSkills({ builtInDir, userDir });
    expect(skills).toHaveLength(1);
    expect(skills[0].skill.description).toBe('user version');
    expect(skills[0].source).toBe('user');
  });

  it('loads skills from both directories when names differ', () => {
    const builtInDir = join(tempDir, 'builtin2');
    const userDir = join(tempDir, 'user2');
    mkdirSync(builtInDir);
    mkdirSync(userDir);

    writeFileSync(join(builtInDir, 'skill-a.yaml'), makeSkillYaml({ name: 'skill-a' }));
    writeFileSync(join(userDir, 'skill-b.yaml'), makeSkillYaml({ name: 'skill-b' }));

    const skills = loadAllSkills({ builtInDir, userDir });
    expect(skills).toHaveLength(2);
    expect(skills.map(s => s.skill.name).sort()).toEqual(['skill-a', 'skill-b']);
  });
});

// ---------------------------------------------------------------------------
// validateSubPipelineRefs
// ---------------------------------------------------------------------------

describe('validateSubPipelineRefs', () => {
  it('passes for a skill with no sub_pipeline references', () => {
    const skill: Skill = {
      name: 'simple',
      description: 'A simple skill',
      stages: [
        { name: 'stage1', prompt: 'Do something' },
        { name: 'stage2', prompt: 'Do more', input_from: ['stage1'] },
      ],
      output: { primary: 'stage2' },
    };

    const loadSkill = () => undefined;
    expect(() => validateSubPipelineRefs(skill, loadSkill)).not.toThrow();
  });

  it('passes for a valid sub_pipeline reference', () => {
    const childSkill: Skill = {
      name: 'child-skill',
      description: 'Child skill',
      stages: [{ name: 's1', prompt: 'Child work' }],
      output: { primary: 's1' },
    };

    const parentSkill: Skill = {
      name: 'parent-skill',
      description: 'Parent skill',
      stages: [
        { name: 'gather', prompt: 'Gather data' },
        { name: 'delegate', sub_pipeline: 'child-skill', input_from: ['gather'] },
      ],
      output: { primary: 'delegate' },
    };

    const loadSkill = (name: string) => {
      if (name === 'child-skill') {
        return { skill: childSkill, filePath: '/skills/child-skill.yaml', source: 'built-in' as const };
      }
      return undefined;
    };

    expect(() => validateSubPipelineRefs(parentSkill, loadSkill)).not.toThrow();
  });

  it('throws SkillCycleError for circular sub_pipeline reference', () => {
    const skillA: Skill = {
      name: 'skill-a',
      description: 'Skill A',
      stages: [{ name: 's1', sub_pipeline: 'skill-b' }],
      output: { primary: 's1' },
    };

    const skillB: Skill = {
      name: 'skill-b',
      description: 'Skill B',
      stages: [{ name: 's1', sub_pipeline: 'skill-a' }],
      output: { primary: 's1' },
    };

    const loadSkill = (name: string) => {
      if (name === 'skill-a') {
        return { skill: skillA, filePath: '/skills/skill-a.yaml', source: 'built-in' as const };
      }
      if (name === 'skill-b') {
        return { skill: skillB, filePath: '/skills/skill-b.yaml', source: 'built-in' as const };
      }
      return undefined;
    };

    expect(() => validateSubPipelineRefs(skillA, loadSkill)).toThrow(SkillCycleError);
  });

  it('throws SkillLoadError for missing sub_pipeline reference', () => {
    const skill: Skill = {
      name: 'parent',
      description: 'Parent',
      stages: [{ name: 's1', sub_pipeline: 'nonexistent-skill' }],
      output: { primary: 's1' },
    };

    const loadSkill = () => undefined;

    expect(() => validateSubPipelineRefs(skill, loadSkill)).toThrow(SkillLoadError);
    expect(() => validateSubPipelineRefs(skill, loadSkill)).toThrow(/nonexistent-skill/);
  });

  it('throws SkillCycleError for self-referencing sub_pipeline', () => {
    const skill: Skill = {
      name: 'self-ref',
      description: 'Self referencing',
      stages: [{ name: 's1', sub_pipeline: 'self-ref' }],
      output: { primary: 's1' },
    };

    const loadSkill = (name: string) => {
      if (name === 'self-ref') {
        return { skill, filePath: '/skills/self-ref.yaml', source: 'built-in' as const };
      }
      return undefined;
    };

    expect(() => validateSubPipelineRefs(skill, loadSkill)).toThrow(SkillCycleError);
  });

  it('throws SkillCycleError for 3-level circular sub_pipeline reference', () => {
    const skillA: Skill = {
      name: 'skill-a',
      description: 'Skill A',
      stages: [{ name: 's1', sub_pipeline: 'skill-b' }],
      output: { primary: 's1' },
    };

    const skillB: Skill = {
      name: 'skill-b',
      description: 'Skill B',
      stages: [{ name: 's1', sub_pipeline: 'skill-c' }],
      output: { primary: 's1' },
    };

    const skillC: Skill = {
      name: 'skill-c',
      description: 'Skill C',
      stages: [{ name: 's1', sub_pipeline: 'skill-a' }],
      output: { primary: 's1' },
    };

    const loadSkill = (name: string) => {
      const map: Record<string, Skill> = {
        'skill-a': skillA,
        'skill-b': skillB,
        'skill-c': skillC,
      };
      if (map[name]) {
        return { skill: map[name], filePath: `/skills/${name}.yaml`, source: 'built-in' as const };
      }
      return undefined;
    };

    expect(() => validateSubPipelineRefs(skillA, loadSkill)).toThrow(SkillCycleError);
  });

  it('passes for a deep non-circular sub_pipeline chain', () => {
    const skillC: Skill = {
      name: 'skill-c',
      description: 'Leaf skill',
      stages: [{ name: 's1', prompt: 'Leaf work' }],
      output: { primary: 's1' },
    };

    const skillB: Skill = {
      name: 'skill-b',
      description: 'Middle skill',
      stages: [{ name: 's1', sub_pipeline: 'skill-c' }],
      output: { primary: 's1' },
    };

    const skillA: Skill = {
      name: 'skill-a',
      description: 'Top skill',
      stages: [{ name: 's1', sub_pipeline: 'skill-b' }],
      output: { primary: 's1' },
    };

    const loadSkill = (name: string) => {
      const map: Record<string, Skill> = {
        'skill-b': skillB,
        'skill-c': skillC,
      };
      if (map[name]) {
        return { skill: map[name], filePath: `/skills/${name}.yaml`, source: 'built-in' as const };
      }
      return undefined;
    };

    expect(() => validateSubPipelineRefs(skillA, loadSkill)).not.toThrow();
  });
});
