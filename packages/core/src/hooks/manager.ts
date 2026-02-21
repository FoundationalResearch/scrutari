import type { HookEvent, HookDefinition, HookExecutionResult, HookContext, HooksConfig } from './types.js';
import { loadHooksFile } from './loader.js';
import { executeHooks } from './executor.js';

export interface HookManagerOptions {
  hooksFilePath?: string;
  onHookOutput?: (event: HookEvent, result: HookExecutionResult) => void;
  onHookError?: (event: HookEvent, error: Error) => void;
}

export class HookManager {
  private config: HooksConfig = { hooks: {} };
  private readonly options: HookManagerOptions;

  constructor(options: HookManagerOptions = {}) {
    this.options = options;
  }

  /**
   * Load hooks from YAML file. Safe to call multiple times (replaces config).
   * Returns empty hooks when file doesn't exist.
   */
  load(filePath?: string): void {
    this.config = loadHooksFile(filePath ?? this.options.hooksFilePath);
  }

  /** Fast check: are there any hooks registered for this event? */
  hasHooks(event: HookEvent): boolean {
    const hooks = this.config.hooks[event];
    return hooks !== undefined && hooks.length > 0;
  }

  /** Get all hook definitions for an event. */
  getHooks(event: HookEvent): HookDefinition[] {
    return this.config.hooks[event] ?? [];
  }

  /**
   * Emit a hook event and execute all matching hooks.
   *
   * Pre-hooks (pre_pipeline, pre_stage, pre_tool): re-throws on failure so the caller can abort.
   * Post-hooks: catches errors and reports via onHookError callback.
   */
  async emit(event: HookEvent, context: HookContext): Promise<HookExecutionResult[]> {
    const hooks = this.config.hooks[event];
    if (!hooks || hooks.length === 0) return [];

    const isPreHook = event.startsWith('pre_');

    return executeHooks(hooks, context, {
      isPreHook,
      onOutput: (result) => {
        this.options.onHookOutput?.(event, result);
      },
      onError: (error) => {
        this.options.onHookError?.(event, error);
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

let defaultManager: HookManager | null = null;

export function getHookManager(): HookManager {
  if (!defaultManager) {
    defaultManager = new HookManager();
  }
  return defaultManager;
}

export function setHookManager(manager: HookManager): void {
  defaultManager = manager;
}

export function resetHookManager(): void {
  defaultManager = null;
}
