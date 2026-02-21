import { describe, it, expect, vi } from 'vitest';
import {
  substituteHookVariables,
  shouldRunHook,
  executeHookCommand,
  executeHooks,
  HookExecutionError,
} from './executor.js';
import type { HookDefinition, HookContext } from './types.js';

describe('substituteHookVariables', () => {
  it('replaces simple variables', () => {
    const result = substituteHookVariables('echo {name}', { name: 'test' });
    expect(result).toBe('echo test');
  });

  it('replaces multiple variables', () => {
    const result = substituteHookVariables('{a} and {b}', { a: 'foo', b: 'bar' });
    expect(result).toBe('foo and bar');
  });

  it('supports dotted notation for nested keys', () => {
    const result = substituteHookVariables('echo {user.name}', {
      user: { name: 'Alice' },
    });
    expect(result).toBe('echo Alice');
  });

  it('keeps unresolved placeholders as-is', () => {
    const result = substituteHookVariables('echo {missing}', {});
    expect(result).toBe('echo {missing}');
  });

  it('JSON-stringifies object values', () => {
    const result = substituteHookVariables('echo {data}', {
      data: { key: 'value' },
    });
    expect(result).toBe('echo {"key":"value"}');
  });

  it('converts numbers to strings', () => {
    const result = substituteHookVariables('cost: {cost}', { cost: 1.23 });
    expect(result).toBe('cost: 1.23');
  });

  it('converts booleans to strings', () => {
    const result = substituteHookVariables('ok: {success}', { success: true });
    expect(result).toBe('ok: true');
  });

  it('handles empty command string', () => {
    const result = substituteHookVariables('', { name: 'test' });
    expect(result).toBe('');
  });
});

describe('shouldRunHook', () => {
  it('returns true when no filters are set', () => {
    const hook: HookDefinition = { command: 'echo' };
    expect(shouldRunHook(hook, {})).toBe(true);
  });

  it('returns true when stage filter matches', () => {
    const hook: HookDefinition = { command: 'echo', stage: 'gather' };
    expect(shouldRunHook(hook, { stage_name: 'gather' })).toBe(true);
  });

  it('returns false when stage filter does not match', () => {
    const hook: HookDefinition = { command: 'echo', stage: 'gather' };
    expect(shouldRunHook(hook, { stage_name: 'analyze' })).toBe(false);
  });

  it('returns true when tool filter matches', () => {
    const hook: HookDefinition = { command: 'echo', tool: 'get_quote' };
    expect(shouldRunHook(hook, { tool_name: 'get_quote' })).toBe(true);
  });

  it('returns false when tool filter does not match', () => {
    const hook: HookDefinition = { command: 'echo', tool: 'get_quote' };
    expect(shouldRunHook(hook, { tool_name: 'search_filings' })).toBe(false);
  });

  it('returns true when both filters match', () => {
    const hook: HookDefinition = { command: 'echo', stage: 'gather', tool: 'get_quote' };
    expect(shouldRunHook(hook, { stage_name: 'gather', tool_name: 'get_quote' })).toBe(true);
  });
});

describe('executeHookCommand', () => {
  it('captures stdout from echo command', async () => {
    const hook: HookDefinition = { command: 'echo hello' };
    const result = await executeHookCommand(hook, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.timedOut).toBe(false);
  });

  it('captures non-zero exit code', async () => {
    const hook: HookDefinition = { command: 'exit 42' };
    const result = await executeHookCommand(hook, {});
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('substitutes variables in command', async () => {
    const hook: HookDefinition = { command: 'echo {name}' };
    const result = await executeHookCommand(hook, { name: 'world' });
    expect(result.stdout.trim()).toBe('world');
  });

  it('detects timeout', async () => {
    const hook: HookDefinition = { command: 'sleep 10', timeout_ms: 100 };
    const result = await executeHookCommand(hook, {});
    expect(result.timedOut).toBe(true);
  }, 5000);

  it('records duration', async () => {
    const hook: HookDefinition = { command: 'echo fast' };
    const result = await executeHookCommand(hook, {});
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('executeHooks', () => {
  it('runs hooks sequentially and returns results', async () => {
    const hooks: HookDefinition[] = [
      { command: 'echo first' },
      { command: 'echo second' },
    ];
    const results = await executeHooks(hooks, {}, { isPreHook: false });
    expect(results).toHaveLength(2);
    expect(results[0].stdout.trim()).toBe('first');
    expect(results[1].stdout.trim()).toBe('second');
  });

  it('throws on pre-hook failure', async () => {
    const hooks: HookDefinition[] = [{ command: 'exit 1' }];
    await expect(
      executeHooks(hooks, {}, { isPreHook: true }),
    ).rejects.toThrow(HookExecutionError);
  });

  it('does not throw on post-hook failure', async () => {
    const onError = vi.fn();
    const hooks: HookDefinition[] = [{ command: 'exit 1' }];
    const results = await executeHooks(hooks, {}, { isPreHook: false, onError });
    expect(results).toHaveLength(1);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('skips hooks that do not match filters', async () => {
    const hooks: HookDefinition[] = [
      { command: 'echo matched', stage: 'gather' },
      { command: 'echo skipped', stage: 'analyze' },
    ];
    const results = await executeHooks(hooks, { stage_name: 'gather' }, { isPreHook: false });
    expect(results).toHaveLength(1);
    expect(results[0].stdout.trim()).toBe('matched');
  });

  it('does not block on background hooks', async () => {
    const hooks: HookDefinition[] = [
      { command: 'sleep 5', background: true },
      { command: 'echo done' },
    ];
    const start = Date.now();
    const results = await executeHooks(hooks, {}, { isPreHook: false });
    const elapsed = Date.now() - start;
    // Background hook should not block — total time should be well under 5s
    expect(elapsed).toBeLessThan(2000);
    // Only the non-background hook should be in results
    expect(results).toHaveLength(1);
    expect(results[0].stdout.trim()).toBe('done');
  });

  it('calls onOutput for each completed hook', async () => {
    const onOutput = vi.fn();
    const hooks: HookDefinition[] = [{ command: 'echo test' }];
    await executeHooks(hooks, {}, { isPreHook: false, onOutput });
    expect(onOutput).toHaveBeenCalledOnce();
    expect(onOutput).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 0 }));
  });
});
