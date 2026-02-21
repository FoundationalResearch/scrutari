import { exec } from 'node:child_process';
import type { HookDefinition, HookExecutionResult, HookContext } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class HookExecutionError extends Error {
  name = 'HookExecutionError';
  constructor(
    message: string,
    public readonly result: HookExecutionResult,
  ) {
    super(message);
  }
}

/**
 * Replace `{variable}` and `{dotted.key}` placeholders in a command string
 * with values from the context. Objects are JSON-stringified.
 * Unresolved placeholders are kept as-is.
 */
export function substituteHookVariables(command: string, context: HookContext): string {
  return command.replace(/\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (_match, key: string) => {
    const value = resolveNestedKey(context, key);
    if (value === undefined) return `{${key}}`;
    if (typeof value === 'object' && value !== null) return JSON.stringify(value);
    return String(value);
  });
}

function resolveNestedKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Check if a hook should run given the current context.
 * Hooks with a `stage` filter only match when `context.stage_name` matches.
 * Hooks with a `tool` filter only match when `context.tool_name` matches.
 */
export function shouldRunHook(hook: HookDefinition, context: HookContext): boolean {
  if (hook.stage && context.stage_name !== hook.stage) return false;
  if (hook.tool && context.tool_name !== hook.tool) return false;
  return true;
}

/**
 * Execute a single hook command via `child_process.exec`.
 */
export function executeHookCommand(
  hook: HookDefinition,
  context: HookContext,
): Promise<HookExecutionResult> {
  const command = substituteHookVariables(hook.command, context);
  const timeoutMs = hook.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      const timedOut = error !== null && 'killed' in error && error.killed === true;

      resolve({
        command,
        exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        durationMs,
        timedOut,
      });
    });

    // Safety: if child doesn't have a pid, resolve immediately
    if (!child.pid && !child.exitCode) {
      // exec callback will still fire
    }
  });
}

/**
 * Execute a list of hooks sequentially.
 *
 * - Pre-hooks (isPreHook=true): throw `HookExecutionError` on non-zero exit or timeout.
 * - Post-hooks (isPreHook=false): errors are caught and reported but never thrown.
 * - Background hooks: fire-and-forget (never block, never throw).
 */
export async function executeHooks(
  hooks: HookDefinition[],
  context: HookContext,
  options: {
    isPreHook: boolean;
    onOutput?: (result: HookExecutionResult) => void;
    onError?: (error: Error) => void;
  },
): Promise<HookExecutionResult[]> {
  const results: HookExecutionResult[] = [];

  for (const hook of hooks) {
    if (!shouldRunHook(hook, context)) continue;

    if (hook.background) {
      // Fire-and-forget
      executeHookCommand(hook, context).catch(() => {});
      continue;
    }

    const result = await executeHookCommand(hook, context);
    results.push(result);
    options.onOutput?.(result);

    if (result.exitCode !== 0 || result.timedOut) {
      const reason = result.timedOut
        ? `Hook timed out after ${result.durationMs}ms`
        : `Hook exited with code ${result.exitCode}`;
      const message = `${reason}: ${result.command}${result.stderr ? `\n${result.stderr.trim()}` : ''}`;

      if (options.isPreHook) {
        throw new HookExecutionError(message, result);
      } else {
        options.onError?.(new HookExecutionError(message, result));
      }
    }
  }

  return results;
}
