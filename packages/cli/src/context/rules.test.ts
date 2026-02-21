import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAllRules, filterActiveRules, globMatch } from './rules.js';
import type { LoadedRule } from './types.js';

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { readdirSync, readFileSync, existsSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('globMatch', () => {
  it('matches exact strings', () => {
    expect(globMatch('AAPL', 'AAPL')).toBe(true);
    expect(globMatch('AAPL', 'MSFT')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(globMatch('aapl', 'AAPL')).toBe(true);
    expect(globMatch('AAPL', 'aapl')).toBe(true);
  });

  it('matches * wildcard', () => {
    expect(globMatch('AA*', 'AAPL')).toBe(true);
    expect(globMatch('AA*', 'AAL')).toBe(true);
    expect(globMatch('AA*', 'MSFT')).toBe(false);
    expect(globMatch('*', 'anything')).toBe(true);
  });

  it('matches ? wildcard', () => {
    expect(globMatch('AAP?', 'AAPL')).toBe(true);
    expect(globMatch('AAP?', 'AAPX')).toBe(true);
    expect(globMatch('AAP?', 'AAP')).toBe(false);
    expect(globMatch('AAP?', 'AAPLL')).toBe(false);
  });

  it('handles special regex characters in pattern', () => {
    expect(globMatch('tech.sector', 'tech.sector')).toBe(true);
    expect(globMatch('tech.sector', 'techXsector')).toBe(false);
  });
});

describe('loadAllRules', () => {
  it('returns empty array when no rule directories exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadAllRules('/project');
    expect(result).toEqual([]);
  });

  it('loads rules from global directory', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).includes('/home/testuser/.scrutari/rules')
    );
    mockReaddirSync.mockReturnValue(['tech.yaml' as never]);
    mockReadFileSync.mockReturnValue(`
name: tech-focus
instruction: Focus on technology sector metrics
priority: 60
`);

    const result = loadAllRules('/project');
    expect(result).toHaveLength(1);
    expect(result[0].rule.name).toBe('tech-focus');
    expect(result[0].source).toBe('global');
  });

  it('loads rules from project directory', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).includes('/project/.scrutari/rules')
    );
    mockReaddirSync.mockReturnValue(['local.yaml' as never]);
    mockReadFileSync.mockReturnValue(`
name: local-rule
instruction: Local project rule
`);

    const result = loadAllRules('/project');
    expect(result).toHaveLength(1);
    expect(result[0].rule.name).toBe('local-rule');
    expect(result[0].source).toBe('project');
  });

  it('project rules override global rules by name', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['rule.yaml' as never]);
    mockReadFileSync.mockImplementation((path) => {
      if (String(path).includes('/home/testuser')) {
        return 'name: same-rule\ninstruction: Global version';
      }
      return 'name: same-rule\ninstruction: Project version';
    });

    const result = loadAllRules('/project');
    expect(result).toHaveLength(1);
    expect(result[0].rule.instruction).toBe('Project version');
    expect(result[0].source).toBe('project');
  });

  it('sorts rules by priority descending', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).includes('/home/testuser/.scrutari/rules')
    );
    mockReaddirSync.mockReturnValue(['rules.yaml' as never]);
    mockReadFileSync.mockReturnValue(`
- name: low-priority
  instruction: Low
  priority: 10
- name: high-priority
  instruction: High
  priority: 90
`);

    const result = loadAllRules('/project');
    expect(result).toHaveLength(2);
    expect(result[0].rule.name).toBe('high-priority');
    expect(result[1].rule.name).toBe('low-priority');
  });

  it('skips invalid rule files', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).includes('/home/testuser/.scrutari/rules')
    );
    mockReaddirSync.mockReturnValue(['bad.yaml' as never]);
    mockReadFileSync.mockReturnValue('not: a: valid: rule');

    const result = loadAllRules('/project');
    expect(result).toEqual([]);
  });

  it('only reads .yaml and .yml files', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).includes('/home/testuser/.scrutari/rules')
    );
    mockReaddirSync.mockReturnValue([
      'rule.yaml' as never,
      'rule.yml' as never,
      'readme.md' as never,
    ]);
    mockReadFileSync.mockImplementation((path) => {
      if (String(path).endsWith('.yaml')) return 'name: rule-one\ninstruction: first rule';
      return 'name: rule-two\ninstruction: second rule';
    });

    const result = loadAllRules('/project');
    expect(result).toHaveLength(2);
    // readme.md should not be read
    const readPaths = mockReadFileSync.mock.calls.map(c => String(c[0]));
    expect(readPaths.every(p => !p.endsWith('.md'))).toBe(true);
  });
});

describe('filterActiveRules', () => {
  const makeRule = (name: string, match?: { ticker?: string; sector?: string; topic?: string }, priority = 50): LoadedRule => ({
    rule: { name, instruction: `Instruction for ${name}`, priority, match },
    filePath: '/test.yaml',
    source: 'global',
  });

  it('includes universal rules (no match block)', () => {
    const rules = [makeRule('universal')];
    const result = filterActiveRules(rules, {});
    expect(result).toHaveLength(1);
  });

  it('includes rules matching ticker', () => {
    const rules = [makeRule('apple-rule', { ticker: 'AAPL' })];
    expect(filterActiveRules(rules, { ticker: 'AAPL' })).toHaveLength(1);
    expect(filterActiveRules(rules, { ticker: 'MSFT' })).toHaveLength(0);
  });

  it('includes rules matching ticker glob', () => {
    const rules = [makeRule('a-stocks', { ticker: 'A*' })];
    expect(filterActiveRules(rules, { ticker: 'AAPL' })).toHaveLength(1);
    expect(filterActiveRules(rules, { ticker: 'AMZN' })).toHaveLength(1);
    expect(filterActiveRules(rules, { ticker: 'MSFT' })).toHaveLength(0);
  });

  it('includes rules matching sector', () => {
    const rules = [makeRule('tech-rule', { sector: 'tech*' })];
    expect(filterActiveRules(rules, { sector: 'technology' })).toHaveLength(1);
    expect(filterActiveRules(rules, { sector: 'energy' })).toHaveLength(0);
  });

  it('excludes ticker-specific rules when no ticker in context', () => {
    const rules = [makeRule('apple-rule', { ticker: 'AAPL' })];
    expect(filterActiveRules(rules, {})).toHaveLength(0);
    expect(filterActiveRules(rules, { sector: 'tech' })).toHaveLength(0);
  });

  it('handles multiple match fields', () => {
    const rules = [makeRule('specific', { ticker: 'AAPL', sector: 'tech*' })];
    expect(filterActiveRules(rules, { ticker: 'AAPL', sector: 'technology' })).toHaveLength(1);
    expect(filterActiveRules(rules, { ticker: 'AAPL', sector: 'energy' })).toHaveLength(0);
    expect(filterActiveRules(rules, { ticker: 'MSFT', sector: 'technology' })).toHaveLength(0);
  });

  it('mixes universal and conditional rules', () => {
    const rules = [
      makeRule('always', undefined),
      makeRule('only-apple', { ticker: 'AAPL' }),
      makeRule('only-tech', { sector: 'tech' }),
    ];
    const result = filterActiveRules(rules, { ticker: 'AAPL' });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.rule.name)).toContain('always');
    expect(result.map(r => r.rule.name)).toContain('only-apple');
  });
});
