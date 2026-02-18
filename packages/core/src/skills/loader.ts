import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { type ZodIssue } from 'zod';
import { SkillSchema } from './schema.js';
import type { Skill, SkillEntry } from './types.js';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class SkillLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(message);
    this.name = 'SkillLoadError';
  }
}

export class SkillValidationError extends SkillLoadError {
  constructor(
    message: string,
    public readonly issues: ZodIssue[],
    filePath?: string,
  ) {
    super(message, filePath);
    this.name = 'SkillValidationError';
  }
}

export class SkillCycleError extends SkillLoadError {
  constructor(
    message: string,
    public readonly cycle: string[],
    filePath?: string,
  ) {
    super(message, filePath);
    this.name = 'SkillCycleError';
  }
}

// ---------------------------------------------------------------------------
// scanSkillFiles — discover .yaml/.yml files in directories
// ---------------------------------------------------------------------------

interface ScannedSkill {
  name: string;
  filePath: string;
  source: 'built-in' | 'user';
}

export function scanSkillFiles(
  builtInDir: string,
  userDir?: string,
): ScannedSkill[] {
  const results: ScannedSkill[] = [];

  const scanDir = (dir: string, source: 'built-in' | 'user') => {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const name = basename(file).replace(/\.ya?ml$/, '');
        results.push({ name, filePath: join(dir, file), source });
      }
    }
  };

  scanDir(builtInDir, 'built-in');
  if (userDir) {
    scanDir(userDir, 'user');
  }

  return results;
}

// ---------------------------------------------------------------------------
// parseSkillFile — read YAML and validate against schema
// ---------------------------------------------------------------------------

export function parseSkillFile(filePath: string): Skill {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new SkillLoadError(
      `Failed to read skill file: ${filePath}`,
      filePath,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    throw new SkillLoadError(
      `Failed to parse YAML in skill file: ${filePath}`,
      filePath,
    );
  }

  const result = SkillSchema.safeParse(parsed);
  if (!result.success) {
    throw new SkillValidationError(
      `Skill validation failed for ${filePath}: ${result.error.issues.map(i => i.message).join('; ')}`,
      result.error.issues,
      filePath,
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// validateDAG — DFS three-color cycle detection
// ---------------------------------------------------------------------------

export function validateDAG(skill: Skill, filePath?: string): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const adjacency = new Map<string, string[]>();

  for (const stage of skill.stages) {
    color.set(stage.name, WHITE);
    adjacency.set(stage.name, stage.input_from ?? []);
  }

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        // Found a cycle — reconstruct path
        return reconstructCycle(node, neighbor, parent);
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node);
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
    }

    color.set(node, BLACK);
    return null;
  }

  for (const stage of skill.stages) {
    if (color.get(stage.name) === WHITE) {
      parent.set(stage.name, null);
      const cycle = dfs(stage.name);
      if (cycle) {
        throw new SkillCycleError(
          `Cycle detected in skill stages: ${cycle.join(' → ')}`,
          cycle,
          filePath,
        );
      }
    }
  }
}

function reconstructCycle(
  current: string,
  target: string,
  parent: Map<string, string | null>,
): string[] {
  const path: string[] = [target, current];
  let node = parent.get(current);
  while (node && node !== target) {
    path.push(node);
    node = parent.get(node);
  }
  path.push(target);
  return path.reverse();
}

// ---------------------------------------------------------------------------
// topologicalSort — Kahn's algorithm
// ---------------------------------------------------------------------------

export function topologicalSort(skill: Skill): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const stage of skill.stages) {
    inDegree.set(stage.name, 0);
    adjacency.set(stage.name, []);
  }

  // Build graph: if stage B has input_from [A], then A → B (A must come before B)
  for (const stage of skill.stages) {
    if (stage.input_from) {
      for (const dep of stage.input_from) {
        adjacency.get(dep)?.push(stage.name);
        inDegree.set(stage.name, (inDegree.get(stage.name) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  // Stable sort: process in original stage order when degrees are equal
  const stageOrder = new Map(skill.stages.map((s, i) => [s.name, i]));
  queue.sort((a, b) => (stageOrder.get(a) ?? 0) - (stageOrder.get(b) ?? 0));

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // Insert in order based on original stage position
        const insertIdx = queue.findIndex(
          q => (stageOrder.get(q) ?? 0) > (stageOrder.get(neighbor) ?? 0),
        );
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// substituteVariables — replace {varName} in templates
// ---------------------------------------------------------------------------

export function substituteVariables(
  template: string,
  variables: Record<string, string | string[] | number | boolean>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, varName: string) => {
    if (!(varName in variables)) return `{${varName}}`;

    const value = variables[varName];
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  });
}

// ---------------------------------------------------------------------------
// loadSkillFile — parse + DAG validate, return SkillEntry
// ---------------------------------------------------------------------------

export function loadSkillFile(
  filePath: string,
  source: 'built-in' | 'user',
): SkillEntry {
  const skill = parseSkillFile(filePath);
  validateDAG(skill, filePath);
  return { skill, filePath, source };
}

// ---------------------------------------------------------------------------
// loadAllSkills — scan dirs, user overrides built-in by name
// ---------------------------------------------------------------------------

export function loadAllSkills(options: {
  builtInDir: string;
  userDir?: string;
}): SkillEntry[] {
  const scanned = scanSkillFiles(options.builtInDir, options.userDir);

  // User skills override built-in by name
  const byName = new Map<string, ScannedSkill>();
  for (const entry of scanned) {
    if (byName.has(entry.name) && entry.source === 'user') {
      byName.set(entry.name, entry);
    } else if (!byName.has(entry.name)) {
      byName.set(entry.name, entry);
    }
  }

  const results: SkillEntry[] = [];
  for (const entry of byName.values()) {
    results.push(loadSkillFile(entry.filePath, entry.source));
  }

  return results;
}
