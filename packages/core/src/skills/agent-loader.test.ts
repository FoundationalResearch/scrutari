import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseSkillMd,
  loadAgentSkill,
  scanAgentSkillSummaries,
  loadAgentSkillBody,
  readAgentSkillResource,
  AgentSkillLoadError,
  AgentSkillValidationError,
} from './agent-loader.js';
import { AgentSkillFrontmatterSchema } from './schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function makeSkillMd(overrides: Record<string, string> = {}): string {
  const frontmatter = {
    name: 'test-skill',
    description: 'A test agent skill',
    ...overrides,
  };
  const yamlLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  return `---\n${yamlLines.join('\n')}\n---\n\n# Test Skill\n\nThis is the body of the skill.`;
}

function makeSkillDir(dir: string, skillMd: string, extras?: Record<string, string>): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), skillMd);
  if (extras) {
    for (const [path, content] of Object.entries(extras)) {
      const fullPath = join(dir, path);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }
  return dir;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'scrutari-agent-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// parseSkillMd
// ---------------------------------------------------------------------------

describe('parseSkillMd', () => {
  it('parses valid frontmatter and body', () => {
    const content = '---\nname: my-skill\ndescription: A skill\n---\n\n# My Skill\n\nBody here.';
    const result = parseSkillMd(content);
    expect(result.frontmatter).toBe('name: my-skill\ndescription: A skill');
    expect(result.body).toBe('# My Skill\n\nBody here.');
  });

  it('throws when missing opening delimiter', () => {
    const content = 'name: my-skill\n---\nBody';
    expect(() => parseSkillMd(content)).toThrow(AgentSkillLoadError);
    expect(() => parseSkillMd(content)).toThrow('must start with ---');
  });

  it('throws when missing closing delimiter', () => {
    const content = '---\nname: my-skill\nBody without closing';
    expect(() => parseSkillMd(content)).toThrow(AgentSkillLoadError);
    expect(() => parseSkillMd(content)).toThrow('missing closing ---');
  });

  it('handles empty body', () => {
    const content = '---\nname: my-skill\n---\n';
    const result = parseSkillMd(content);
    expect(result.frontmatter).toBe('name: my-skill');
    expect(result.body).toBe('');
  });

  it('handles --- in body after frontmatter', () => {
    const content = '---\nname: my-skill\n---\n\nSome text\n\n---\n\nMore text after horizontal rule';
    const result = parseSkillMd(content);
    expect(result.frontmatter).toBe('name: my-skill');
    expect(result.body).toContain('---');
    expect(result.body).toContain('More text');
  });
});

// ---------------------------------------------------------------------------
// AgentSkillFrontmatterSchema
// ---------------------------------------------------------------------------

describe('AgentSkillFrontmatterSchema', () => {
  it('accepts a valid minimal frontmatter', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: 'my-skill',
      description: 'A valid skill',
    });
    expect(result.success).toBe(true);
  });

  it('accepts full frontmatter with all optional fields', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: 'dcf-valuation',
      description: 'DCF valuation methodology',
      license: 'MIT',
      compatibility: 'scrutari >=0.1',
      metadata: { author: 'Test', version: '1.0' },
      'allowed-tools': 'market-data, edgar',
    });
    expect(result.success).toBe(true);
  });

  it('rejects names with uppercase letters', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: 'MySkill',
      description: 'Invalid name',
    });
    expect(result.success).toBe(false);
  });

  it('rejects names with spaces', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: 'my skill',
      description: 'Invalid name',
    });
    expect(result.success).toBe(false);
  });

  it('rejects names starting with a hyphen', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: '-bad-name',
      description: 'Invalid name',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: '',
      description: 'No name',
    });
    expect(result.success).toBe(false);
  });

  it('rejects description over 1024 chars', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: 'test',
      description: 'x'.repeat(1025),
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing description', () => {
    const result = AgentSkillFrontmatterSchema.safeParse({
      name: 'test',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadAgentSkill
// ---------------------------------------------------------------------------

describe('loadAgentSkill', () => {
  it('loads a valid agent skill', () => {
    const dir = makeSkillDir(join(tempDir, 'my-skill'), makeSkillMd());
    const skill = loadAgentSkill(dir, 'built-in');
    expect(skill.frontmatter.name).toBe('test-skill');
    expect(skill.frontmatter.description).toBe('A test agent skill');
    expect(skill.body).toContain('# Test Skill');
    expect(skill.dirPath).toBe(dir);
    expect(skill.source).toBe('built-in');
    expect(skill.pipelineSkillPath).toBeUndefined();
  });

  it('detects co-located pipeline YAML', () => {
    const dir = makeSkillDir(join(tempDir, 'dcf'), makeSkillMd(), {
      'dcf-valuation.pipeline.yaml': 'name: dcf-valuation\ndescription: test\nstages:\n  - name: s1\n    prompt: test\noutput:\n  primary: s1',
    });
    const skill = loadAgentSkill(dir, 'built-in');
    expect(skill.pipelineSkillPath).toBe(join(dir, 'dcf-valuation.pipeline.yaml'));
  });

  it('throws AgentSkillLoadError for missing SKILL.md', () => {
    const dir = join(tempDir, 'no-skill');
    mkdirSync(dir, { recursive: true });
    expect(() => loadAgentSkill(dir, 'user')).toThrow(AgentSkillLoadError);
    expect(() => loadAgentSkill(dir, 'user')).toThrow('Failed to read SKILL.md');
  });

  it('throws AgentSkillValidationError for invalid frontmatter', () => {
    const dir = makeSkillDir(
      join(tempDir, 'bad-fm'),
      '---\nname: INVALID\ndescription: test\n---\nBody',
    );
    expect(() => loadAgentSkill(dir, 'user')).toThrow(AgentSkillValidationError);
  });

  it('throws for invalid YAML in frontmatter', () => {
    const dir = makeSkillDir(
      join(tempDir, 'bad-yaml'),
      '---\n{ invalid yaml:: [\n---\nBody',
    );
    expect(() => loadAgentSkill(dir, 'user')).toThrow(AgentSkillLoadError);
  });
});

// ---------------------------------------------------------------------------
// scanAgentSkillSummaries
// ---------------------------------------------------------------------------

describe('scanAgentSkillSummaries', () => {
  it('finds agent skill directories', () => {
    makeSkillDir(join(tempDir, 'skill-a'), makeSkillMd({ name: 'skill-a', description: 'Skill A' }));
    makeSkillDir(join(tempDir, 'skill-b'), makeSkillMd({ name: 'skill-b', description: 'Skill B' }));

    const summaries = scanAgentSkillSummaries(tempDir);
    expect(summaries).toHaveLength(2);
    expect(summaries.map(s => s.name).sort()).toEqual(['skill-a', 'skill-b']);
    expect(summaries.every(s => s.kind === 'agent')).toBe(true);
  });

  it('ignores non-directory entries', () => {
    writeFileSync(join(tempDir, 'not-a-dir.txt'), 'hello');
    makeSkillDir(join(tempDir, 'real-skill'), makeSkillMd());

    const summaries = scanAgentSkillSummaries(tempDir);
    expect(summaries).toHaveLength(1);
  });

  it('ignores directories without SKILL.md', () => {
    const dir = join(tempDir, 'empty-dir');
    mkdirSync(dir);
    writeFileSync(join(dir, 'readme.md'), '# Not a skill');

    const summaries = scanAgentSkillSummaries(tempDir);
    expect(summaries).toEqual([]);
  });

  it('user directory skills override built-in by name', () => {
    const builtInDir = join(tempDir, 'builtin');
    const userDir = join(tempDir, 'user');
    mkdirSync(builtInDir);
    mkdirSync(userDir);

    makeSkillDir(join(builtInDir, 'analysis'), makeSkillMd({ name: 'analysis', description: 'Built-in' }));
    makeSkillDir(join(userDir, 'analysis'), makeSkillMd({ name: 'analysis', description: 'User override' }));

    const summaries = scanAgentSkillSummaries(builtInDir, userDir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].description).toBe('User override');
    expect(summaries[0].source).toBe('user');
  });

  it('handles missing directories gracefully', () => {
    const summaries = scanAgentSkillSummaries('/nonexistent/path');
    expect(summaries).toEqual([]);
  });

  it('returns empty array for directory with no agent skills', () => {
    const dir = join(tempDir, 'empty');
    mkdirSync(dir);
    const summaries = scanAgentSkillSummaries(dir);
    expect(summaries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadAgentSkillBody
// ---------------------------------------------------------------------------

describe('loadAgentSkillBody', () => {
  it('returns only the body', () => {
    const dir = makeSkillDir(join(tempDir, 'body-test'), makeSkillMd());
    const body = loadAgentSkillBody(dir);
    expect(body).toContain('# Test Skill');
    expect(body).not.toContain('name:');
  });

  it('throws for nonexistent directory', () => {
    expect(() => loadAgentSkillBody('/nonexistent/path')).toThrow(AgentSkillLoadError);
  });
});

// ---------------------------------------------------------------------------
// readAgentSkillResource
// ---------------------------------------------------------------------------

describe('readAgentSkillResource', () => {
  it('reads a file from references/', () => {
    const dir = makeSkillDir(join(tempDir, 'resources'), makeSkillMd(), {
      'references/guide.md': '# Guide Content',
    });
    const content = readAgentSkillResource(dir, 'references/guide.md');
    expect(content).toBe('# Guide Content');
  });

  it('reads a nested file from scripts/', () => {
    const dir = makeSkillDir(join(tempDir, 'nested'), makeSkillMd(), {
      'scripts/helpers/calc.py': 'print("hello")',
    });
    const content = readAgentSkillResource(dir, 'scripts/helpers/calc.py');
    expect(content).toBe('print("hello")');
  });

  it('reads from assets/', () => {
    const dir = makeSkillDir(join(tempDir, 'assets-test'), makeSkillMd(), {
      'assets/template.txt': 'template content',
    });
    const content = readAgentSkillResource(dir, 'assets/template.txt');
    expect(content).toBe('template content');
  });

  it('blocks path traversal with ../', () => {
    const dir = makeSkillDir(join(tempDir, 'traversal'), makeSkillMd());
    expect(() => readAgentSkillResource(dir, '../../../etc/passwd')).toThrow(AgentSkillLoadError);
    expect(() => readAgentSkillResource(dir, '../../../etc/passwd')).toThrow('Path traversal not allowed');
  });

  it('blocks access to disallowed top-level directories', () => {
    const dir = makeSkillDir(join(tempDir, 'disallowed'), makeSkillMd(), {
      'secret/data.txt': 'secret',
    });
    expect(() => readAgentSkillResource(dir, 'secret/data.txt')).toThrow(AgentSkillLoadError);
    expect(() => readAgentSkillResource(dir, 'secret/data.txt')).toThrow('Resource path must be in one of');
  });

  it('throws for nonexistent resource file', () => {
    const dir = makeSkillDir(join(tempDir, 'missing-resource'), makeSkillMd());
    mkdirSync(join(dir, 'references'));
    expect(() => readAgentSkillResource(dir, 'references/nonexistent.md')).toThrow(AgentSkillLoadError);
    expect(() => readAgentSkillResource(dir, 'references/nonexistent.md')).toThrow('Failed to read resource');
  });
});
