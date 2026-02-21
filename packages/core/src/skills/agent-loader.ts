import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentSkillFrontmatterSchema } from './schema.js';
import type { AgentSkill, AgentSkillSummary } from './types.js';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class AgentSkillLoadError extends Error {
  constructor(
    message: string,
    public readonly dirPath?: string,
  ) {
    super(message);
    this.name = 'AgentSkillLoadError';
  }
}

export class AgentSkillValidationError extends AgentSkillLoadError {
  constructor(
    message: string,
    public readonly issues: string[],
    dirPath?: string,
  ) {
    super(message, dirPath);
    this.name = 'AgentSkillValidationError';
  }
}

// ---------------------------------------------------------------------------
// parseSkillMd — split YAML frontmatter from Markdown body
// ---------------------------------------------------------------------------

export function parseSkillMd(content: string): { frontmatter: string; body: string } {
  if (!content.startsWith('---')) {
    throw new AgentSkillLoadError('SKILL.md must start with --- frontmatter delimiter');
  }

  const secondDelimiter = content.indexOf('\n---', 3);
  if (secondDelimiter === -1) {
    throw new AgentSkillLoadError('SKILL.md missing closing --- frontmatter delimiter');
  }

  const frontmatter = content.slice(3, secondDelimiter).trim();
  const body = content.slice(secondDelimiter + 4).trim();

  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// loadAgentSkill — read SKILL.md, validate frontmatter, detect co-located pipeline
// ---------------------------------------------------------------------------

export function loadAgentSkill(dirPath: string, source: 'built-in' | 'user'): AgentSkill {
  const skillMdPath = join(dirPath, 'SKILL.md');

  let content: string;
  try {
    content = readFileSync(skillMdPath, 'utf-8');
  } catch {
    throw new AgentSkillLoadError(
      `Failed to read SKILL.md in: ${dirPath}`,
      dirPath,
    );
  }

  const { frontmatter: rawFrontmatter, body } = parseSkillMd(content);

  let parsed: unknown;
  try {
    parsed = parseYaml(rawFrontmatter);
  } catch {
    throw new AgentSkillLoadError(
      `Failed to parse YAML frontmatter in: ${skillMdPath}`,
      dirPath,
    );
  }

  const result = AgentSkillFrontmatterSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(i => i.message);
    throw new AgentSkillValidationError(
      `Agent skill frontmatter validation failed for ${skillMdPath}: ${issues.join('; ')}`,
      issues,
      dirPath,
    );
  }

  // Detect co-located *.pipeline.yaml
  let pipelineSkillPath: string | undefined;
  try {
    const files = readdirSync(dirPath);
    const pipelineFile = files.find(f => f.endsWith('.pipeline.yaml') || f.endsWith('.pipeline.yml'));
    if (pipelineFile) {
      pipelineSkillPath = join(dirPath, pipelineFile);
    }
  } catch {
    // Ignore read errors for optional pipeline detection
  }

  return {
    frontmatter: result.data,
    body,
    dirPath,
    source,
    pipelineSkillPath,
  };
}

// ---------------------------------------------------------------------------
// scanAgentSkillSummaries — scan directories for SKILL.md, return lightweight summaries
// ---------------------------------------------------------------------------

export function scanAgentSkillSummaries(
  builtInDir: string,
  userDir?: string,
): AgentSkillSummary[] {
  const byName = new Map<string, AgentSkillSummary>();

  const scanDir = (dir: string, source: 'built-in' | 'user') => {
    if (!existsSync(dir)) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const skillMdPath = join(entryPath, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const { frontmatter: rawFrontmatter } = parseSkillMd(content);
        const parsed = parseYaml(rawFrontmatter);
        const result = AgentSkillFrontmatterSchema.safeParse(parsed);

        if (result.success) {
          const summary: AgentSkillSummary = {
            name: result.data.name,
            description: result.data.description,
            dirPath: entryPath,
            source,
            kind: 'agent',
          };

          // User overrides built-in by name
          if (byName.has(summary.name) && source !== 'user') continue;
          byName.set(summary.name, summary);
        }
      } catch {
        // Skip directories with invalid SKILL.md
      }
    }
  };

  scanDir(builtInDir, 'built-in');
  if (userDir) {
    scanDir(userDir, 'user');
  }

  return Array.from(byName.values());
}

// ---------------------------------------------------------------------------
// loadAgentSkillBody — return just the Markdown body (progressive disclosure level 2)
// ---------------------------------------------------------------------------

export function loadAgentSkillBody(dirPath: string): string {
  const skillMdPath = join(dirPath, 'SKILL.md');

  let content: string;
  try {
    content = readFileSync(skillMdPath, 'utf-8');
  } catch {
    throw new AgentSkillLoadError(
      `Failed to read SKILL.md in: ${dirPath}`,
      dirPath,
    );
  }

  const { body } = parseSkillMd(content);
  return body;
}

// ---------------------------------------------------------------------------
// readAgentSkillResource — read from scripts/, references/, assets/ with path traversal protection
// ---------------------------------------------------------------------------

const ALLOWED_RESOURCE_DIRS = ['scripts', 'references', 'assets'];

export function readAgentSkillResource(dirPath: string, relativePath: string): string {
  const resolved = resolve(dirPath, relativePath);
  const rel = relative(dirPath, resolved);

  // Check for path traversal
  if (rel.startsWith('..') || resolve(dirPath, rel) !== resolved) {
    throw new AgentSkillLoadError(
      `Path traversal not allowed: "${relativePath}"`,
      dirPath,
    );
  }

  // Must be in an allowed subdirectory
  const topDir = rel.split('/')[0];
  if (!ALLOWED_RESOURCE_DIRS.includes(topDir)) {
    throw new AgentSkillLoadError(
      `Resource path must be in one of: ${ALLOWED_RESOURCE_DIRS.join(', ')}. Got: "${topDir}"`,
      dirPath,
    );
  }

  try {
    return readFileSync(resolved, 'utf-8');
  } catch {
    throw new AgentSkillLoadError(
      `Failed to read resource: ${relativePath} in ${dirPath}`,
      dirPath,
    );
  }
}
