import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { ZodIssue } from 'zod';
import { HooksFileSchema } from './schema.js';
import type { HooksConfig } from './types.js';

const DEFAULT_HOOKS_PATH = '.scrutari/hooks.yaml';

export class HookLoadError extends Error {
  name = 'HookLoadError';
  constructor(message: string, public readonly filePath?: string) {
    super(message);
  }
}

export class HookValidationError extends HookLoadError {
  name = 'HookValidationError';
  constructor(
    message: string,
    public readonly issues: ZodIssue[],
    filePath?: string,
  ) {
    super(message, filePath);
  }
}

function getDefaultHooksPath(): string {
  return resolve(homedir(), DEFAULT_HOOKS_PATH);
}

/**
 * Load hooks config from a YAML file.
 * Returns `{ hooks: {} }` when the file doesn't exist (graceful opt-in).
 */
export function loadHooksFile(filePath?: string): HooksConfig {
  const resolvedPath = filePath ?? getDefaultHooksPath();

  if (!existsSync(resolvedPath)) {
    return { hooks: {} };
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    throw new HookLoadError(
      `Failed to read hooks file: ${err instanceof Error ? err.message : String(err)}`,
      resolvedPath,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new HookLoadError(
      `Failed to parse hooks YAML: ${err instanceof Error ? err.message : String(err)}`,
      resolvedPath,
    );
  }

  // Handle empty file
  if (parsed === null || parsed === undefined) {
    return { hooks: {} };
  }

  const result = HooksFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new HookValidationError(
      `Invalid hooks configuration: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      result.error.issues,
      resolvedPath,
    );
  }

  return { hooks: result.data.hooks ?? {} };
}
