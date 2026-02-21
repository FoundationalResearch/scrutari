import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { RuleSchema } from './schemas.js';
import type { LoadedRule, RuleMatchContext } from './types.js';

const GLOBAL_RULES_DIR = resolve(homedir(), '.scrutari', 'rules');
const PROJECT_RULES_DIR = '.scrutari/rules';

function loadRulesFromDir(dir: string, source: 'global' | 'project'): LoadedRule[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const rules: LoadedRule[] = [];

  for (const file of files) {
    const filePath = resolve(dir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const raw = parseYaml(content);
      if (raw === null || raw === undefined) continue;

      // Support both single rule and array of rules per file
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        const result = RuleSchema.safeParse(item);
        if (result.success) {
          rules.push({ rule: result.data, filePath, source });
        }
      }
    } catch {
      // Skip unparseable files
    }
  }

  return rules;
}

export function loadAllRules(cwd: string): LoadedRule[] {
  const globalRules = loadRulesFromDir(GLOBAL_RULES_DIR, 'global');
  const projectRules = loadRulesFromDir(resolve(cwd, PROJECT_RULES_DIR), 'project');

  // Project rules override global rules by name
  const byName = new Map<string, LoadedRule>();
  for (const r of globalRules) byName.set(r.rule.name, r);
  for (const r of projectRules) byName.set(r.rule.name, r);

  return [...byName.values()].sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
}

/**
 * Simple glob match: `*` matches any sequence, `?` matches single char.
 * Case-insensitive.
 */
export function globMatch(pattern: string, value: string): boolean {
  const regex = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`, 'i').test(value);
}

export function filterActiveRules(rules: LoadedRule[], context: RuleMatchContext): LoadedRule[] {
  return rules.filter(({ rule }) => {
    if (!rule.match) return true; // Universal rule — always active

    const { ticker, sector, topic } = rule.match;
    if (ticker && context.ticker && !globMatch(ticker, context.ticker)) return false;
    if (sector && context.sector && !globMatch(sector, context.sector)) return false;
    if (topic && context.topic && !globMatch(topic, context.topic)) return false;

    // If the rule has a match field but no context was provided for that field, include it
    // This means: if the user hasn't mentioned a ticker, a ticker-specific rule won't filter out
    if (ticker && !context.ticker) return false;
    if (sector && !context.sector) return false;
    if (topic && !context.topic) return false;

    return true;
  });
}
