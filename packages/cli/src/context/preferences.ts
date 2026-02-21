import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { Preferences } from './types.js';

export const PreferencesSchema = z.object({
  analysis_depth: z.enum(['quick', 'standard', 'deep', 'exhaustive']).default('standard'),
  favorite_tickers: z.array(z.string()).default([]),
  favorite_sectors: z.array(z.string()).default([]),
  watchlists: z.record(z.string(), z.array(z.string())).default({}),
  output_format: z.enum(['markdown', 'json', 'docx']).optional(),
  risk_framing: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  default_persona: z.string().optional(),
  custom_instructions: z.string().optional(),
});

export const PREFERENCES_DEFAULTS: Preferences = {
  analysis_depth: 'standard',
  favorite_tickers: [],
  favorite_sectors: [],
  watchlists: {},
  risk_framing: 'moderate',
};

const PREFERENCES_PATH = resolve(homedir(), '.scrutari', 'preferences.yaml');

export class PreferencesLoadError extends Error {
  name = 'PreferencesLoadError';
}

export function loadPreferences(): Preferences {
  if (!existsSync(PREFERENCES_PATH)) {
    return { ...PREFERENCES_DEFAULTS };
  }

  let raw: unknown;
  try {
    const content = readFileSync(PREFERENCES_PATH, 'utf-8');
    raw = parseYaml(content);
  } catch (err) {
    throw new PreferencesLoadError(
      `Failed to parse ${PREFERENCES_PATH}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (raw === null || raw === undefined) {
    return { ...PREFERENCES_DEFAULTS };
  }

  const result = PreferencesSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new PreferencesLoadError(
      `Invalid preferences in ${PREFERENCES_PATH}:\n${issues}`
    );
  }

  return result.data;
}
