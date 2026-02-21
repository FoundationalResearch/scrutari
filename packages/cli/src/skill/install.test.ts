import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir so installSkill writes to a temp directory
let tempDir: string;
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks are set up
const { resolveSkillUrl, installSkill } = await import('./install.js');

// A valid skill YAML that passes SkillSchema validation
const validSkillYaml = `
name: test-skill
description: A test skill
stages:
  - name: analyze
    prompt: Analyze something.
    output_format: markdown
output:
  primary: analyze
  format: markdown
`;

const invalidYaml = `
this is: [not
  valid yaml: {{{
`;

// Valid YAML but does not pass SkillSchema
const schemaInvalidYaml = `
name: bad-skill
description: Missing stages
output:
  primary: nonexistent
`;

describe('resolveSkillUrl', () => {
  it('passes through a full HTTPS URL', () => {
    const url = 'https://example.com/skills/my-skill.yaml';
    expect(resolveSkillUrl(url)).toBe(url);
  });

  it('passes through a full HTTP URL', () => {
    const url = 'http://example.com/skills/my-skill.yaml';
    expect(resolveSkillUrl(url)).toBe(url);
  });

  it('resolves shorthand user/repo/skill to GitHub raw URL with main branch', () => {
    const result = resolveSkillUrl('alice/my-skills/deep-dive');
    expect(result).toBe(
      'https://raw.githubusercontent.com/alice/my-skills/main/skills/deep-dive.yaml',
    );
  });

  it('resolves shorthand with @branch to GitHub raw URL with specified branch', () => {
    const result = resolveSkillUrl('alice/my-skills/deep-dive@develop');
    expect(result).toBe(
      'https://raw.githubusercontent.com/alice/my-skills/develop/skills/deep-dive.yaml',
    );
  });

  it('throws for shorthand with too few parts', () => {
    expect(() => resolveSkillUrl('alice/my-skills')).toThrow('Invalid skill reference');
  });

  it('throws for shorthand with too many parts', () => {
    expect(() => resolveSkillUrl('alice/my-skills/sub/deep-dive')).toThrow('Invalid skill reference');
  });

  it('throws for a bare name with no slashes', () => {
    expect(() => resolveSkillUrl('deep-dive')).toThrow('Invalid skill reference');
  });

  it('includes the invalid input in the error message', () => {
    expect(() => resolveSkillUrl('bad')).toThrow('"bad"');
  });
});

describe('installSkill', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scrutari-install-test-'));
    mockFetch.mockReset();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('installs a valid skill from a URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => validSkillYaml,
    });

    const result = await installSkill('https://example.com/skills/test-skill.yaml');

    expect(result.name).toBe('test-skill');
    expect(result.source).toBe('https://example.com/skills/test-skill.yaml');
    expect(result.filePath).toBe(join(tempDir, '.scrutari', 'skills', 'test-skill.yaml'));
    expect(existsSync(result.filePath)).toBe(true);

    // Verify file content
    const content = readFileSync(result.filePath, 'utf-8');
    expect(content).toBe(validSkillYaml);
  });

  it('installs a valid skill from shorthand', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => validSkillYaml,
    });

    const result = await installSkill('alice/my-skills/test-skill');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/alice/my-skills/main/skills/test-skill.yaml',
    );
    expect(result.name).toBe('test-skill');
  });

  it('throws on fetch failure (HTTP error)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not found',
    });

    await expect(installSkill('https://example.com/missing.yaml')).rejects.toThrow(
      'Failed to fetch skill: 404 Not Found',
    );
  });

  it('throws on invalid YAML response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => invalidYaml,
    });

    await expect(installSkill('https://example.com/bad.yaml')).rejects.toThrow(
      'not valid YAML',
    );
  });

  it('throws on schema validation failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => schemaInvalidYaml,
    });

    await expect(installSkill('https://example.com/invalid-schema.yaml')).rejects.toThrow(
      'Skill validation failed',
    );
  });

  it('creates the skills directory if it does not exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => validSkillYaml,
    });

    const skillsDir = join(tempDir, '.scrutari', 'skills');
    expect(existsSync(skillsDir)).toBe(false);

    await installSkill('https://example.com/skills/test-skill.yaml');

    expect(existsSync(skillsDir)).toBe(true);
  });

  it('throws when resolveSkillUrl fails on bad shorthand', async () => {
    await expect(installSkill('bad-shorthand')).rejects.toThrow('Invalid skill reference');
  });
});
