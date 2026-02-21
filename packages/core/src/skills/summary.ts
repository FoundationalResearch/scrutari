import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { scanAgentSkillSummaries } from './agent-loader.js';
import type { UnifiedSkillSummary } from './types.js';

export interface SkillSummary {
  name: string;
  description: string;
  filePath: string;
  source: 'built-in' | 'user';
}

const SummarySchema = z.object({
  name: z.string(),
  description: z.string(),
}).passthrough();

/**
 * Scan skill directories and extract lightweight summaries (name + description only).
 * Does NOT perform full Zod + DAG validation — much faster than loadAllSkills.
 * Falls back gracefully on parse errors.
 * User skills override built-in skills with the same name.
 */
export function scanSkillSummaries(builtInDir: string, userDir?: string): SkillSummary[] {
  const byName = new Map<string, SkillSummary>();

  const scanDir = (dir: string, source: 'built-in' | 'user') => {
    if (!existsSync(dir)) return;
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;

      const filenameStem = basename(file).replace(/\.pipeline\.ya?ml$/, '').replace(/\.ya?ml$/, '');
      const filePath = join(dir, file);
      const summary = parseSummary(filePath, filenameStem, source);

      // User overrides built-in by name
      if (byName.has(summary.name) && source !== 'user') continue;
      byName.set(summary.name, summary);
    }
  };

  scanDir(builtInDir, 'built-in');
  if (userDir) {
    scanDir(userDir, 'user');
  }

  return Array.from(byName.values());
}

function parseSummary(filePath: string, filenameStem: string, source: 'built-in' | 'user'): SkillSummary {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseYaml(content);
    const result = SummarySchema.safeParse(parsed);
    if (result.success) {
      return {
        name: result.data.name,
        description: result.data.description,
        filePath,
        source,
      };
    }
  } catch {
    // Fall through to degraded fallback
  }

  return {
    name: filenameStem,
    description: 'Failed to load',
    filePath,
    source,
  };
}

// ---------------------------------------------------------------------------
// scanUnifiedSummaries — merge pipeline + agent skill summaries
// ---------------------------------------------------------------------------

export function scanUnifiedSummaries(builtInDir: string, userDir?: string): UnifiedSkillSummary[] {
  const pipelineSummaries = scanSkillSummaries(builtInDir, userDir);
  const agentSummaries = scanAgentSkillSummaries(builtInDir, userDir);

  const results: UnifiedSkillSummary[] = [];

  for (const s of pipelineSummaries) {
    results.push({
      name: s.name,
      description: s.description,
      kind: 'pipeline',
      source: s.source,
      path: s.filePath,
    });
  }

  for (const s of agentSummaries) {
    results.push({
      name: s.name,
      description: s.description,
      kind: 'agent',
      source: s.source,
      path: s.dirPath,
    });
  }

  return results;
}
